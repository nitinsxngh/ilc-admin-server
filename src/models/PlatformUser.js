import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of ILC-Dashboard `users` collection.
 * ILC-Dashboard/client/backend owns this data — never write from admin API routes.
 */
const platformUserSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.users, strict: false, timestamps: true }
);

platformUserSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('PlatformUser', platformUserSchema);
