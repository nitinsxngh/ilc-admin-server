import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const eLibraryCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.eLibraryCategories }
);

export default mongoose.model('ELibraryCategory', eLibraryCategorySchema);
