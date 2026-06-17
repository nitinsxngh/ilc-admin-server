import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const timeSlotSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    isBooked: { type: Boolean, default: false },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  },
  { _id: true }
);

const availabilitySchema = new mongoose.Schema(
  {
    counsellorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Counsellor', required: true, index: true },
    date: { type: Date, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    slotDuration: { type: Number, required: true, min: 15 },
    slots: [timeSlotSchema],
    type: { type: String, enum: ['available', 'blocked', 'recurring'], default: 'available' },
    recurringPattern: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly', null], default: null },
      daysOfWeek: [{ type: Number, min: 0, max: 6 }],
      endDate: { type: Date, default: null },
    },
    blockReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CounsellorUser', default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.availabilities }
);

availabilitySchema.index({ counsellorId: 1, date: 1 });

export default mongoose.model('Availability', availabilitySchema);
