import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

/**
 * Counsellor portal login accounts for ILC-Admins.
 * Collection: ilc_counsellor_users
 *
 * NEVER use the dashboard `users` collection — that belongs to ILC-Dashboard students.
 */
const counsellorUserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['super_admin', 'counsellor', 'student'],
      default: 'counsellor',
    },
    counsellorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Counsellor', default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.counsellorUsers }
);

counsellorUserSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

counsellorUserSchema.statics.hashPassword = async function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export default mongoose.model('CounsellorUser', counsellorUserSchema);
