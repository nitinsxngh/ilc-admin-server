import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const ilcAdminUserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'IlcAdminRole', required: true },
    roleSlug: { type: String, required: true, index: true },
    roleName: { type: String, required: true },
    pageAccess: [{ type: String, trim: true }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'IlcAdminUser', default: null },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: ADMIN_COLLECTIONS.adminUsers,
  }
);

ilcAdminUserSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

ilcAdminUserSchema.statics.hashPassword = async function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export default mongoose.model('IlcAdminUser', ilcAdminUserSchema);
