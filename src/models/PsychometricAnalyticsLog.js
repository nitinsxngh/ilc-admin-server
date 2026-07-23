import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of ILC-Dashboard psychometric analytics logs.
 * Timing / session data captured while taking the test.
 */
const psychometricAnalyticsLogSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.psychometricAnalyticsLogs, strict: false, timestamps: true }
);

psychometricAnalyticsLogSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('PsychometricAnalyticsLog', psychometricAnalyticsLogSchema);
