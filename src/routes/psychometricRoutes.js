import { Router } from 'express';
import { param } from 'express-validator';
import {
  listPsychometricReports,
  getPsychometricReport,
  getPsychometricStats,
} from '../controllers/psychometricController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(...adminAuth);

router.get('/stats', requirePermission('psychometric.list'), getPsychometricStats);
router.get('/', requirePermission('psychometric.list'), listPsychometricReports);
router.get(
  '/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('psychometric.view'),
  getPsychometricReport
);

export default router;
