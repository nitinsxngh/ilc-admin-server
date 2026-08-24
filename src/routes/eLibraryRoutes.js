import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createELibraryDocument,
  deleteELibraryDocument,
  getELibraryDocument,
  getPublicELibraryDocument,
  getPublicELibraryHome,
  listELibraryDocuments,
  listELibraryMeta,
  listPublicELibraryDocuments,
  streamELibraryFile,
  updateELibraryDocument,
  updateELibraryStatus,
} from '../controllers/eLibraryController.js';
import {
  createELibraryCategory,
  createELibraryLanguage,
  deleteELibraryCategory,
  deleteELibraryLanguage,
  listELibraryCategories,
  listELibraryLanguages,
  updateELibraryCategoryStatus,
  updateELibraryLanguageStatus,
} from '../controllers/eLibraryTaxonomyController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { eLibraryPdfUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';

const router = Router();

function handlePdfUpload(req, res, next) {
  eLibraryPdfUpload(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'PDF must be 25 MB or smaller.'
          : err.message || 'Invalid PDF upload.';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

router.get('/public/home', getPublicELibraryHome);
router.get('/public', listPublicELibraryDocuments);
router.get(
  '/public/:id',
  [param('id').isMongoId()],
  validate,
  getPublicELibraryDocument
);

router.use(...adminAuth);

router.get('/meta', requirePermission('elibrary.list'), listELibraryMeta);
router.get('/categories', requirePermission('elibrary.list'), listELibraryCategories);
router.post(
  '/categories',
  requirePermission('elibrary.list'),
  [body('name').trim().notEmpty()],
  validate,
  createELibraryCategory
);
router.patch(
  '/categories/:id/status',
  requirePermission('elibrary.list'),
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  validate,
  updateELibraryCategoryStatus
);
router.delete(
  '/categories/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('elibrary.list'),
  deleteELibraryCategory
);
router.get('/languages', requirePermission('elibrary.list'), listELibraryLanguages);
router.post(
  '/languages',
  requirePermission('elibrary.list'),
  [body('name').trim().notEmpty()],
  validate,
  createELibraryLanguage
);
router.patch(
  '/languages/:id/status',
  requirePermission('elibrary.list'),
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  validate,
  updateELibraryLanguageStatus
);
router.delete(
  '/languages/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('elibrary.list'),
  deleteELibraryLanguage
);
router.get('/', requirePermission('elibrary.list'), listELibraryDocuments);
router.get(
  '/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('elibrary.list'),
  getELibraryDocument
);
router.get(
  '/:id/file',
  [param('id').isMongoId()],
  validate,
  requirePermission('elibrary.list'),
  streamELibraryFile
);
router.post('/', requirePermission('elibrary.list'), handlePdfUpload, createELibraryDocument);
router.put(
  '/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('elibrary.list'),
  handlePdfUpload,
  updateELibraryDocument
);
router.patch(
  '/:id/status',
  requirePermission('elibrary.list'),
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  validate,
  updateELibraryStatus
);
router.delete(
  '/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('elibrary.list'),
  deleteELibraryDocument
);

export default router;
