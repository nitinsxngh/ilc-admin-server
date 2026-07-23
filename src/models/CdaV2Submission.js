import mongoose from 'mongoose';
import { readOnlyDashboardPlugin } from '../utils/readOnlyDashboard.js';
import { DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Read-only mirror of ILC-Dashboard manual (CDA v2) psychometric submissions.
 * ILC-Dashboard/client/backend owns this data.
 */
const cdaV2SubmissionSchema = new mongoose.Schema(
  {},
  { collection: DASHBOARD_COLLECTIONS.cdaV2Submissions, strict: false, timestamps: true }
);

cdaV2SubmissionSchema.plugin(readOnlyDashboardPlugin);

export default mongoose.model('CdaV2Submission', cdaV2SubmissionSchema);
