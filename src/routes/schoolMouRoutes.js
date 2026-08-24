import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listPublicSchoolMous,
  listSchoolMous,
  createSchoolMou,
  updateSchoolMou,
  updateSchoolMouStatus,
  deleteSchoolMou,
} from '../controllers/schoolMouController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schoolMouBodyValidators } from '../validators/schoolMouValidators.js';

const router = Router();

router.get('/public', listPublicSchoolMous);

router.use(...adminAuth);

router.get('/', requirePermission('psychometric.mou'), listSchoolMous);
router.post('/', requirePermission('psychometric.mou'), schoolMouBodyValidators, validate, createSchoolMou);
router.put(
  '/:id',
  [param('id').isMongoId(), ...schoolMouBodyValidators],
  validate,
  requirePermission('psychometric.mou'),
  updateSchoolMou
);
router.patch(
  '/:id/status',
  requirePermission('psychometric.mou'),
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  validate,
  updateSchoolMouStatus
);
router.delete(
  '/:id',
  [param('id').isMongoId()],
  validate,
  requirePermission('psychometric.mou'),
  deleteSchoolMou
);

export default router;
