import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listAvailability,
  getAvailability,
  createAvailability,
  updateAvailability,
  createRecurringAvailability,
  blockAvailability,
  deleteAvailability,
  getCounsellorSlots,
} from '../controllers/availabilityController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Public slot lookup for booking
router.get('/slots/:counsellorId', getCounsellorSlots);

router.use(...adminAuth);

router.get('/', requirePermission('availability'), listAvailability);

router.get('/:id', [param('id').isMongoId()], validate, requirePermission('availability'), getAvailability);

router.post(
  '/',
  requirePermission('availability'),
  [
    body('counsellorId').isMongoId(),
    body('date').notEmpty(),
    body('startTime').notEmpty(),
    body('endTime').notEmpty(),
    body('slotDuration').optional().isInt({ min: 15 }),
  ],
  validate,
  createAvailability
);

router.post(
  '/recurring',
  requirePermission('availability'),
  [
    body('counsellorId').isMongoId(),
    body('startDate').notEmpty(),
    body('endDate').notEmpty(),
    body('startTime').notEmpty(),
    body('endTime').notEmpty(),
    body('frequency').isIn(['daily', 'weekly', 'monthly']),
  ],
  validate,
  createRecurringAvailability
);

router.post(
  '/block',
  requirePermission('availability'),
  [
    body('counsellorId').isMongoId(),
    body('dates').isArray({ min: 1 }),
  ],
  validate,
  blockAvailability
);

router.put(
  '/:id',
  requirePermission('availability'),
  [
    param('id').isMongoId(),
    body('date').optional().notEmpty(),
    body('startTime').optional().notEmpty(),
    body('endTime').optional().notEmpty(),
    body('slotDuration').optional().isInt({ min: 15 }),
    body('blockReason').optional().isString(),
  ],
  validate,
  updateAvailability
);

router.delete('/:id', [param('id').isMongoId()], validate, requirePermission('availability'), deleteAvailability);

export default router;
