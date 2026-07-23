import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listSpecializations,
  createSpecialization,
  softDeleteSpecialization,
  permanentDeleteSpecialization,
} from '../controllers/specializationController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', listSpecializations);

router.use(...adminAuth);

router.post('/', requirePermission('specializations'), [body('name').trim().notEmpty()], validate, createSpecialization);
router.delete(
  '/:id/permanent',
  requirePermission('specializations'),
  [param('id').isMongoId()],
  validate,
  permanentDeleteSpecialization
);
router.delete(
  '/:id',
  requirePermission('specializations'),
  [param('id').isMongoId()],
  validate,
  softDeleteSpecialization
);

export default router;
