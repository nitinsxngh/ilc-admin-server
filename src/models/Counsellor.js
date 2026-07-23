import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const counsellorSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    profileImage: { type: String, default: '' },
    designation: { type: String, trim: true, default: 'Career Counsellor' },
    bio: { type: String, default: '' },
    experienceYears: { type: Number, default: 0 },
    sessionFee: { type: Number, required: true, min: 0 },
    sessionDuration: { type: Number, required: true, min: 15, default: 45 },
    languages: [{ type: String, trim: true }],
    specializations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Specialization' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    isRecommended: { type: Boolean, default: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CounsellorUser', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.counsellors }
);

counsellorSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

counsellorSchema.set('toJSON', { virtuals: true });
counsellorSchema.set('toObject', { virtuals: true });

export default mongoose.model('Counsellor', counsellorSchema);
