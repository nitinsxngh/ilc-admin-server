import mongoose from 'mongoose';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const studyAbroadChatSchema = new mongoose.Schema(
  {
    studentUserId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    counsellorId: { type: String, required: true, index: true },
    messages: { type: Array, default: [] },
    studentLastReadAt: { type: Number, default: 0 },
    counsellorLastReadAt: { type: Number, default: 0 },
  },
  { timestamps: true, collection: ADMIN_COLLECTIONS.studyAbroadChats, strict: false }
);

export default mongoose.model('StudyAbroadChat', studyAbroadChatSchema);
