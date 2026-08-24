import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const eLibraryDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    author: { type: String, default: '', trim: true },
    language: { type: String, required: true, trim: true },
    publishedYear: { type: Number, min: 1900, max: 2100 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 1 },
    contentType: { type: String, default: 'application/pdf' },
    s3Key: { type: String, required: true },
    thumbnailS3Key: { type: String, default: '' },
    uploadedBy: {
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String, default: '' },
      email: { type: String, default: '' },
    },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.eLibraryDocuments }
);

eLibraryDocumentSchema.index({ title: 'text', description: 'text', tags: 'text', fileName: 'text', author: 'text' });
eLibraryDocumentSchema.index({ category: 1, status: 1, createdAt: -1 });
eLibraryDocumentSchema.index({ language: 1 });
eLibraryDocumentSchema.index({ tags: 1 });
eLibraryDocumentSchema.index({ createdAt: -1 });

export default mongoose.model('ELibraryDocument', eLibraryDocumentSchema);
