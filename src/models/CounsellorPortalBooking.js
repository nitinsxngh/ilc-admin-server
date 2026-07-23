import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of student-portal counsellor bookings
 * (`ilc_counsellor_bookings`), including payment/reference metadata.
 */
const counsellorBookingSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.counsellorBookings, strict: false, timestamps: true }
);

counsellorBookingSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('CounsellorPortalBooking', counsellorBookingSchema);
