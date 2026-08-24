import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const eLibraryLanguageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.eLibraryLanguages }
);

export default mongoose.model('ELibraryLanguage', eLibraryLanguageSchema);
