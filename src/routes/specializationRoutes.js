import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listSpecializations,
  createSpecialization,
  updateSpecialization,
  deleteSpecialization,
} from '../controllers/specializationController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/', listSpecializations);

router.use(...adminAuth);

router.post('/', requirePermission('specializations'), [body('name').trim().notEmpty()], validate, createSpecialization);
router.put('/:id', [param('id').isMongoId()], validate, requirePermission('specializations'), updateSpecialization);
router.delete('/:id', [param('id').isMongoId()], validate, requirePermission('specializations'), deleteSpecialization);

export default router;
