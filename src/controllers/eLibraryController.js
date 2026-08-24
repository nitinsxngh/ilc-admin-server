import mongoose from 'mongoose';
import ELibraryDocument from '../models/ELibraryDocument.js';
import ELibraryCategory from '../models/ELibraryCategory.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { listActiveTaxonomyNames, resolveTaxonomyName } from './eLibraryTaxonomyController.js';
import { logActivity } from '../services/activityLogger.js';
import { paginated, success } from '../utils/apiResponse.js';
import {
  buildELibraryDocumentKey,
  buildELibraryThumbnailKey,
  deleteObject,
  enrichELibraryDocument,
  extractS3Key,
  getObject,
  ensureELibraryPublicAccess,
  uploadObject,
} from '../services/s3.js';
import { renderPdfFirstPageJpeg } from '../services/pdfThumbnail.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTags(raw) {
  const source = Array.isArray(raw) ? raw.join(',') : String(raw || '');
  const unique = new Set(
    source
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 40))
  );
  return [...unique].slice(0, 20);
}

async function streamToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function uploadPdfThumbnail(documentId, pdfBuffer) {
  const jpeg = await renderPdfFirstPageJpeg(pdfBuffer);
  const key = buildELibraryThumbnailKey(documentId);
  await uploadObject(key, jpeg, 'image/jpeg', { publicRead: true });
  return key;
}

async function safeCreateThumbnail(documentId, pdfBuffer) {
  try {
    return await uploadPdfThumbnail(documentId, pdfBuffer);
  } catch (err) {
    console.warn('PDF thumbnail generation failed:', err.message);
    return '';
  }
}

async function removeThumbnail(key) {
  const s3Key = extractS3Key(key);
  if (!s3Key) return;
  try {
    await deleteObject(s3Key);
  } catch {
    // old preview can stay if cleanup fails
  }
}

async function ensureMissingThumbnails(items) {
  const missing = items.filter((item) => item.s3Key && !item.thumbnailS3Key).slice(0, 2);
  await Promise.all(
    missing.map(async (item) => {
      try {
        const { body } = await getObject(extractS3Key(item.s3Key));
        const pdf = await streamToBuffer(body);
        const key = await uploadPdfThumbnail(item._id, pdf);
        if (!key) return;
        item.thumbnailS3Key = key;
        await item.save();
      } catch (err) {
        console.warn('Could not backfill PDF thumbnail:', err.message);
      }
    })
  );
}

function actorFromReq(req) {
  const admin = req.adminUser || {};
  return {
    id: admin._id,
    name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim(),
    email: admin.email || '',
  };
}

async function parseMetadata(body, { allowInactiveCategory = '', allowInactiveLanguage = '' } = {}) {
  const yearRaw = body.publishedYear;
  const publishedYear = yearRaw === '' || yearRaw == null ? undefined : Number(yearRaw);
  const [categoryResult, languageResult] = await Promise.all([
    resolveTaxonomyName('category', body.category, { allowInactiveName: allowInactiveCategory }),
    resolveTaxonomyName('language', body.language, { allowInactiveName: allowInactiveLanguage }),
  ]);
  if (categoryResult.error) {
    return { error: categoryResult.error };
  }
  if (languageResult.error) {
    return { error: languageResult.error };
  }
  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    category: categoryResult.name,
    tags: parseTags(body.tags),
    author: String(body.author || '').trim(),
    language: languageResult.name,
    publishedYear: Number.isFinite(publishedYear) ? publishedYear : undefined,
    status: body.status === 'inactive' ? 'inactive' : 'active',
  };
}

export async function listELibraryMeta(_req, res, next) {
  try {
    await ensureELibraryPublicAccess();
    return success(res, await listActiveTaxonomyNames());
  } catch (err) {
    next(err);
  }
}

export async function listELibraryDocuments(req, res, next) {
  try {
    await ensureELibraryPublicAccess();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status && ['active', 'inactive'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.category) {
      filter.category = String(req.query.category);
    }
    if (req.query.language) {
      filter.language = String(req.query.language);
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { title: rx },
        { description: rx },
        { tags: rx },
        { fileName: rx },
        { author: rx },
      ];
    }

    const [items, total] = await Promise.all([
      ELibraryDocument.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ELibraryDocument.countDocuments(filter),
    ]);
    await ensureMissingThumbnails(items);

    return paginated(
      res,
      items.map(enrichELibraryDocument),
      { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }
    );
  } catch (err) {
    next(err);
  }
}

export async function createELibraryDocument(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A PDF file is required.' });
    }
    const meta = await parseMetadata(req.body);
    if (meta.error) {
      return res.status(400).json({ success: false, message: meta.error });
    }
    if (!meta.title || meta.title.length < 2) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    const id = new mongoose.Types.ObjectId();
    const s3Key = buildELibraryDocumentKey(id, req.file.originalname);
    await uploadObject(s3Key, req.file.buffer, 'application/pdf', { publicRead: true });
    const thumbnailS3Key = await safeCreateThumbnail(id, req.file.buffer);

    let item;
    try {
      item = await ELibraryDocument.create({
        _id: id,
        ...meta,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        contentType: 'application/pdf',
        s3Key,
        thumbnailS3Key,
        uploadedBy: actorFromReq(req),
      });
    } catch (err) {
      try {
        await deleteObject(s3Key);
      } catch {
        // avoid leaving an orphan only if cleanup also fails
      }
      await removeThumbnail(thumbnailS3Key);
      throw err;
    }

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ELIBRARY_CREATED,
      description: `Uploaded e-library PDF "${item.title}"`,
      entityType: 'elibrary_document',
      entityId: item._id,
    });
    return success(res, enrichELibraryDocument(item), 'Document uploaded', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateELibraryDocument(req, res, next) {
  try {
    const item = await ELibraryDocument.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const meta = await parseMetadata(req.body, {
      allowInactiveCategory: item.category,
      allowInactiveLanguage: item.language,
    });
    if (meta.error) {
      return res.status(400).json({ success: false, message: meta.error });
    }
    if (!meta.title || meta.title.length < 2) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    Object.assign(item, meta);

    if (req.file) {
      const nextKey = buildELibraryDocumentKey(item._id, req.file.originalname);
      await uploadObject(nextKey, req.file.buffer, 'application/pdf', { publicRead: true });
      const nextThumb = await safeCreateThumbnail(item._id, req.file.buffer);
      const oldKey = extractS3Key(item.s3Key);
      const oldThumb = item.thumbnailS3Key;
      item.fileName = req.file.originalname;
      item.fileSize = req.file.size;
      item.contentType = 'application/pdf';
      item.s3Key = nextKey;
      if (nextThumb) item.thumbnailS3Key = nextThumb;
      if (oldThumb && oldThumb !== item.thumbnailS3Key) {
        await removeThumbnail(oldThumb);
      }
      if (oldKey && oldKey !== nextKey) {
        try {
          await deleteObject(oldKey);
        } catch {
          // keep going if old file cleanup fails
        }
      }
    }

    await item.save();
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ELIBRARY_UPDATED,
      description: `Updated e-library PDF "${item.title}"`,
      entityType: 'elibrary_document',
      entityId: item._id,
    });
    return success(res, enrichELibraryDocument(item), 'Document updated');
  } catch (err) {
    next(err);
  }
}

export async function updateELibraryStatus(req, res, next) {
  try {
    const { status } = req.body;
    const item = await ELibraryDocument.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ELIBRARY_STATUS_CHANGED,
      description: `Marked e-library PDF "${item.title}" as ${status}`,
      entityType: 'elibrary_document',
      entityId: item._id,
    });
    return success(res, enrichELibraryDocument(item), `Document ${status}`);
  } catch (err) {
    next(err);
  }
}

export async function deleteELibraryDocument(req, res, next) {
  try {
    const item = await ELibraryDocument.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    const key = extractS3Key(item.s3Key);
    const thumbKey = item.thumbnailS3Key;
    await ELibraryDocument.findByIdAndDelete(item._id);
    if (key) {
      try {
        await deleteObject(key);
      } catch {
        // document already removed from catalog
      }
    }
    await removeThumbnail(thumbKey);
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ELIBRARY_DELETED,
      description: `Deleted e-library PDF "${item.title}"`,
      entityType: 'elibrary_document',
      entityId: item._id,
    });
    return success(res, null, 'Document deleted');
  } catch (err) {
    next(err);
  }
}

function toPublicDocument(doc) {
  const obj = enrichELibraryDocument(doc);
  return {
    _id: obj._id,
    title: obj.title,
    description: obj.description || '',
    category: obj.category,
    tags: obj.tags || [],
    author: obj.author || '',
    language: obj.language,
    publishedYear: obj.publishedYear,
    fileName: obj.fileName,
    fileSize: obj.fileSize,
    fileUrl: obj.fileUrl,
    thumbnailUrl: obj.thumbnailUrl,
    createdAt: obj.createdAt,
  };
}

function publicDocumentFilter(query = {}) {
  const filter = { status: 'active' };
  if (query.category) filter.category = String(query.category);
  if (query.language) filter.language = String(query.language);
  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { tags: rx }, { fileName: rx }, { author: rx }];
  }
  return filter;
}

export async function getPublicELibraryHome(req, res, next) {
  try {
    await ensureELibraryPublicAccess();
    const [total, recent, categoryDocs, categories] = await Promise.all([
      ELibraryDocument.countDocuments({ status: 'active' }),
      ELibraryDocument.find({ status: 'active' }).sort({ createdAt: -1 }).limit(6),
      ELibraryDocument.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      ELibraryCategory.find({ status: 'active' }).sort({ name: 1 }),
    ]);
    await ensureMissingThumbnails(recent);
    const countByName = Object.fromEntries(categoryDocs.map((row) => [row._id, row.count]));
    return success(res, {
      stats: { titles: total },
      recent: recent.map(toPublicDocument),
      categories: categories.map((item) => ({
        name: item.name,
        count: countByName[item.name] || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function listPublicELibraryDocuments(req, res, next) {
  try {
    await ensureELibraryPublicAccess();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;
    const filter = publicDocumentFilter(req.query);
    const [items, total] = await Promise.all([
      ELibraryDocument.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ELibraryDocument.countDocuments(filter),
    ]);
    await ensureMissingThumbnails(items);
    return paginated(res, items.map(toPublicDocument), {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getPublicELibraryDocument(req, res, next) {
  try {
    const item = await ELibraryDocument.findOne({ _id: req.params.id, status: 'active' });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    if (!item.thumbnailS3Key && item.s3Key) {
      await ensureMissingThumbnails([item]);
    }
    return success(res, toPublicDocument(item));
  } catch (err) {
    next(err);
  }
}

export async function getELibraryDocument(req, res, next) {
  try {
    const item = await ELibraryDocument.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    return success(res, enrichELibraryDocument(item));
  } catch (err) {
    next(err);
  }
}

export async function streamELibraryFile(req, res, next) {
  try {
    const item = await ELibraryDocument.findById(req.params.id);
    if (!item?.s3Key) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    const { body } = await getObject(extractS3Key(item.s3Key));
    const download = String(req.query.download || '') === '1';
    const safeName = String(item.fileName || 'document.pdf').replace(/"/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${safeName}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    body.pipe(res);
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    next(err);
  }
}
