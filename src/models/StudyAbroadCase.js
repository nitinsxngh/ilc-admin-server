import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const studyAbroadCaseSchema = new mongoose.Schema(
  {
    studentUserId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    counsellorId: { type: String, required: true, index: true },
    countries: { type: Array, default: [] },
    journeySteps: { type: Array, default: [] },
    notes: { type: Array, default: [] },
    documents: { type: Array, default: [] },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.studyAbroadCases, strict: false }
);

export default mongoose.model('StudyAbroadCase', studyAbroadCaseSchema);
