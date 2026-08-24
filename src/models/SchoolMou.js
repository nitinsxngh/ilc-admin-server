import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const schoolMouSchema = new mongoose.Schema(
  {
    sequenceNumber: { type: Number, required: true, unique: true, min: 1 },
    schoolName: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.schoolMous }
);

schoolMouSchema.index({ schoolName: 1 });
schoolMouSchema.index({ status: 1, sequenceNumber: 1 });

export default mongoose.model('SchoolMou', schoolMouSchema);
