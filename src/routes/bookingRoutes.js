import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listBookings,
  getBooking,
  createBooking,
  updateBookingStatus,
  rescheduleBooking,
} from '../controllers/bookingController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Public booking (student)
router.post(
  '/',
  [
    body('counsellorId').isMongoId(),
    body('availabilityId').isMongoId(),
    body('slotId').isMongoId(),
    body('studentName').trim().notEmpty(),
  ],
  validate,
  createBooking
);

router.use(...adminAuth);

router.get('/', requirePermission('bookings.all', 'bookings.upcoming', 'bookings.completed', 'bookings.cancelled'), listBookings);
router.get('/:id', [param('id').isMongoId()], validate, requirePermission('bookings.all'), getBooking);

router.patch(
  '/:id/status',
  requirePermission('bookings.all'),
  [
    param('id').isMongoId(),
    body('status').isIn(['pending', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show']),
  ],
  validate,
  updateBookingStatus
);

router.patch(
  '/:id/reschedule',
  requirePermission('bookings.all'),
  [
    param('id').isMongoId(),
    body('availabilityId').isMongoId(),
    body('slotId').isMongoId(),
  ],
  validate,
  rescheduleBooking
);

export default router;
