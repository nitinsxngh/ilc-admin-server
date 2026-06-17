import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of ILC-Dashboard payment transactions.
 * ILC-Dashboard/client/backend owns this data.
 */
const paymentTransactionSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.paymentTransactions, strict: false, timestamps: true }
);

paymentTransactionSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('PaymentTransaction', paymentTransactionSchema);
