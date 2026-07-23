import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of student-portal counsellor invoices
 * (`ilc_counsellor_invoices`).
 */
const counsellorInvoiceSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.counsellorInvoices, strict: false, timestamps: true }
);

counsellorInvoiceSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('CounsellorInvoice', counsellorInvoiceSchema);
