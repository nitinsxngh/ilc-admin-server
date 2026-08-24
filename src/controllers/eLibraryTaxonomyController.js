import ELibraryCategory from '../models/ELibraryCategory.js';
import ELibraryLanguage from '../models/ELibraryLanguage.js';
import ELibraryDocument from '../models/ELibraryDocument.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { DEFAULT_ELIBRARY_CATEGORIES, DEFAULT_ELIBRARY_LANGUAGES } from '../constants/eLibrary.js';
import { logActivity } from '../services/activityLogger.js';
import { success } from '../utils/apiResponse.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TAXONOMY = {
  category: {
    Model: ELibraryCategory,
    defaults: DEFAULT_ELIBRARY_CATEGORIES,
    label: 'Category',
    entityType: 'elibrary_category',
    documentField: 'category',
    created: ACTIVITY_ACTIONS.ELIBRARY_CATEGORY_CREATED,
    statusChanged: ACTIVITY_ACTIONS.ELIBRARY_CATEGORY_STATUS_CHANGED,
    deleted: ACTIVITY_ACTIONS.ELIBRARY_CATEGORY_DELETED,
  },
  language: {
    Model: ELibraryLanguage,
    defaults: DEFAULT_ELIBRARY_LANGUAGES,
    label: 'Language',
    entityType: 'elibrary_language',
    documentField: 'language',
    created: ACTIVITY_ACTIONS.ELIBRARY_LANGUAGE_CREATED,
    statusChanged: ACTIVITY_ACTIONS.ELIBRARY_LANGUAGE_STATUS_CHANGED,
    deleted: ACTIVITY_ACTIONS.ELIBRARY_LANGUAGE_DELETED,
  },
};

async function seedIfEmpty(kind) {
  const config = TAXONOMY[kind];
  const count = await config.Model.countDocuments();
  if (count > 0) return;
  await config.Model.insertMany(config.defaults.map((name) => ({ name, status: 'active' })));
}

export async function ensureELibraryTaxonomyDefaults() {
  await Promise.all([seedIfEmpty('category'), seedIfEmpty('language')]);
}

export async function listActiveTaxonomyNames() {
  await ensureELibraryTaxonomyDefaults();
  const [categories, languages] = await Promise.all([
    ELibraryCategory.find({ status: 'active' }).sort({ name: 1 }),
    ELibraryLanguage.find({ status: 'active' }).sort({ name: 1 }),
  ]);
  return {
    categories: categories.map((item) => item.name),
    languages: languages.map((item) => item.name),
  };
}

export async function resolveTaxonomyName(kind, rawName, { allowInactiveName = '' } = {}) {
  const config = TAXONOMY[kind];
  const name = String(rawName || '').trim();
  if (!name) {
    return { error: `${config.label} is required.` };
  }
  await seedIfEmpty(kind);
  const item = await config.Model.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
  });
  if (!item) {
    return { error: `Select a valid ${config.label.toLowerCase()}.` };
  }
  if (item.status !== 'active' && item.name !== allowInactiveName) {
    return { error: `This ${config.label.toLowerCase()} is inactive.` };
  }
  return { name: item.name };
}

function handlersFor(kind) {
  const config = TAXONOMY[kind];

  return {
    async list(req, res, next) {
      try {
        await seedIfEmpty(kind);
        const filter = req.query.all ? {} : { status: 'active' };
        const items = await config.Model.find(filter).sort({ name: 1 });
        return success(res, items);
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const name = String(req.body.name || '').trim();
        if (!name) {
          return res.status(400).json({ success: false, message: `${config.label} name is required.` });
        }

        const duplicate = await config.Model.findOne({
          name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        });
        if (duplicate) {
          return res.status(409).json({ success: false, message: `${config.label} already exists.` });
        }

        const item = await config.Model.create({ name, status: 'active' });
        logActivity({
          req,
          action: config.created,
          description: `Added e-library ${config.label.toLowerCase()} "${name}"`,
          entityType: config.entityType,
          entityId: item._id,
        });
        return success(res, item, `${config.label} added`, 201);
      } catch (err) {
        if (err.code === 11000) {
          return res.status(409).json({ success: false, message: `${config.label} already exists.` });
        }
        next(err);
      }
    },

    async updateStatus(req, res, next) {
      try {
        const status = req.body.status === 'inactive' ? 'inactive' : 'active';
        const item = await config.Model.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!item) {
          return res.status(404).json({ success: false, message: `${config.label} not found` });
        }
        logActivity({
          req,
          action: config.statusChanged,
          description: `Marked e-library ${config.label.toLowerCase()} "${item.name}" as ${status}`,
          entityType: config.entityType,
          entityId: item._id,
        });
        return success(res, item, `${config.label} ${status}`);
      } catch (err) {
        next(err);
      }
    },

    async remove(req, res, next) {
      try {
        const item = await config.Model.findById(req.params.id);
        if (!item) {
          return res.status(404).json({ success: false, message: `${config.label} not found` });
        }
        const inUse = await ELibraryDocument.countDocuments({ [config.documentField]: item.name });
        if (inUse > 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot delete: used by ${inUse} document(s). Deactivate it instead.`,
          });
        }
        await config.Model.findByIdAndDelete(item._id);
        logActivity({
          req,
          action: config.deleted,
          description: `Deleted e-library ${config.label.toLowerCase()} "${item.name}"`,
          entityType: config.entityType,
          entityId: item._id,
        });
        return success(res, null, `${config.label} deleted`);
      } catch (err) {
        next(err);
      }
    },
  };
}

const categoryHandlers = handlersFor('category');
const languageHandlers = handlersFor('language');

export const listELibraryCategories = categoryHandlers.list;
export const createELibraryCategory = categoryHandlers.create;
export const updateELibraryCategoryStatus = categoryHandlers.updateStatus;
export const deleteELibraryCategory = categoryHandlers.remove;

export const listELibraryLanguages = languageHandlers.list;
export const createELibraryLanguage = languageHandlers.create;
export const updateELibraryLanguageStatus = languageHandlers.updateStatus;
export const deleteELibraryLanguage = languageHandlers.remove;
