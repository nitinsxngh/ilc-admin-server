import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    description: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'IlcAdminUser', default: null, index: true },
    actorEmail: { type: String, trim: true, default: '' },
    actorName: { type: String, trim: true, default: '' },
    entityType: { type: String, trim: true, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.activityLogs }
);

activityLogSchema.index({ createdAt: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);
