import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of ILC-Dashboard psychometric submissions.
 * ILC-Dashboard/client/backend owns this data.
 */
const psychometricSubmissionSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.psychometricSubmissions, strict: false, timestamps: true }
);

psychometricSubmissionSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('PsychometricSubmission', psychometricSubmissionSchema);
