import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const ilcAdminRoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: {
      type: String,
      enum: ['super_admin', 'admin', 'user'],
      required: true,
    },
    description: { type: String, default: '' },
    level: { type: Number, required: true, min: 1, max: 3 },
    isSystem: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  {
    timestamps: true,
    collection: ADMIN_COLLECTIONS.adminRoles,
  }
);

export default mongoose.model('IlcAdminRole', ilcAdminRoleSchema);
