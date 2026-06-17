import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listCounsellors,
  getCounsellor,
  createCounsellor,
  updateCounsellor,
  updateCounsellorStatus,
  deleteCounsellor,
  getPublicCounsellors,
  getCounsellorDetailForBooking,
} from '../controllers/counsellorController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Public routes (student booking)
router.get('/public', getPublicCounsellors);
router.get('/public/:id/booking', getCounsellorDetailForBooking);

// Admin routes
router.use(...adminAuth);

router.get('/', requirePermission('counsellors.list'), listCounsellors);
router.get('/:id', [param('id').isMongoId()], validate, requirePermission('counsellors.list'), getCounsellor);

router.post(
  '/',
  requirePermission('counsellors.create'),
  [
    body('firstName').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('sessionFee').isNumeric(),
    body('sessionDuration').optional().isInt({ min: 15 }),
  ],
  validate,
  createCounsellor
);

router.put('/:id', [param('id').isMongoId()], validate, requirePermission('counsellors.edit'), updateCounsellor);

router.patch(
  '/:id/status',
  requirePermission('counsellors.edit'),
  [param('id').isMongoId(), body('status').isIn(['active', 'inactive'])],
  validate,
  updateCounsellorStatus
);

router.delete('/:id', [param('id').isMongoId()], validate, requirePermission('counsellors.edit'), deleteCounsellor);

export default router;
