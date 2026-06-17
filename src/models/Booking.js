import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'rescheduled',
  'cancelled',
  'completed',
  'no_show',
];

const bookingSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformUser', default: null },
    studentName: { type: String, required: true, trim: true },
    studentEmail: { type: String, trim: true, default: '' },
    studentPhone: { type: String, trim: true, default: '' },
    counsellorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Counsellor', required: true, index: true },
    availabilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Availability', required: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, required: true },
    bookingDate: { type: Date, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending' },
    sessionFee: { type: Number, required: true },
    meetingLink: { type: String, default: '' },
    notes: { type: String, default: '' },
    rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    cancelledAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.bookings }
);

bookingSchema.index({ counsellorId: 1, bookingDate: 1, startTime: 1 });

export { BOOKING_STATUSES };
export default mongoose.model('Booking', bookingSchema);
