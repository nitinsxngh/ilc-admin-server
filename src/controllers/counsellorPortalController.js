import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import CounsellorUser from '../models/User.js';
import PlatformUser from '../models/PlatformUser.js';
import StudyAbroadCase from '../models/StudyAbroadCase.js';
import StudyAbroadChat from '../models/StudyAbroadChat.js';
import { getPublicObjectUrl } from '../services/s3.js';
import { success } from '../utils/apiResponse.js';

function signCounsellorToken(user) {
  return jwt.sign(
    {
      typ: 'counsellor',
      id: String(user._id),
      email: user.email,
      counsellorId: String(user.counsellorId),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function toCounsellor(user) {
  return {
    id: String(user._id),
    counsellorId: String(user.counsellorId),
    firstName: user.firstName,
    lastName: user.lastName || '',
    email: user.email,
  };
}

function toCaseJson(doc) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    studentUserId: String(obj.studentUserId),
    counsellorId: String(obj.counsellorId),
    countries: obj.countries || [],
    journeySteps: obj.journeySteps || [],
    notes: obj.notes || [],
    documents: (obj.documents || []).map((item) => ({
      id: item.id,
      label: item.label,
      fileName: item.fileName,
      s3Key: item.s3Key,
      uploadedAt: item.uploadedAt,
      status: item.status || 'pending',
      fileUrl: item.s3Key ? getPublicObjectUrl(item.s3Key) : '',
      reviewedAt: item.reviewedAt || null,
    })),
    updatedAt: obj.updatedAt,
  };
}

function toStudentSummary(user, detailed = false) {
  const profile = user.profileCompletion || {};
  const resume = user.resumeProfile || {};
  const summary = {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || profile.mobile || '',
    careerId: user.careerId || '',
    dateOfBirth: user.dateOfBirth || null,
    userType: profile.userType || '',
    instituteName: profile.instituteName || '',
    courseTitle: profile.courseTitle || '',
    yearOfStudy: profile.yearOfStudy || '',
    studyLocation: profile.careerAspirations?.studyLocation || '',
    preferredStream: profile.careerAspirations?.preferredStream || '',
    preferredSpecialization: profile.careerAspirations?.preferredSpecialization || '',
    address: user.address || null,
  };
  if (!detailed) return summary;
  return {
    ...summary,
    parentName: profile.parentName || '',
    parentMobile: profile.parentMobile || '',
    incomeCategory: profile.incomeCategory || '',
    education: Array.isArray(resume.education) ? resume.education : [],
    work: Array.isArray(resume.work) ? resume.work : [],
  };
}

export async function counsellorLogin(req, res, next) {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await CounsellorUser.findOne({
      email,
      status: 'active',
      role: { $in: ['counsellor', 'super_admin'] },
    });
    if (!user?.passwordHash || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid counsellor credentials' });
    }
    if (!user.counsellorId) {
      return res.status(403).json({ success: false, message: 'Counsellor profile is not linked yet' });
    }

    return success(res, { token: signCounsellorToken(user), counsellor: toCounsellor(user) }, 'Logged in');
  } catch (err) {
    next(err);
  }
}

export async function counsellorMe(req, res, next) {
  try {
    return success(res, toCounsellor(req.counsellorUser));
  } catch (err) {
    next(err);
  }
}

export async function listCounsellorStudents(req, res, next) {
  try {
    const counsellorId = req.counsellor.counsellorId;
    const cases = await StudyAbroadCase.find({ counsellorId }).sort({ updatedAt: -1 });
    const studentIds = cases.map((item) => item.studentUserId);
    const users = await PlatformUser.find({ _id: { $in: studentIds } }).select(
      'fullName email phone careerId dateOfBirth address profileCompletion'
    );
    const chats = await StudyAbroadChat.find({ studentUserId: { $in: studentIds } }).select(
      'studentUserId messages counsellorLastReadAt'
    );
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const chatMap = new Map(chats.map((chat) => [String(chat.studentUserId), chat]));

    return success(
      res,
      cases.map((item) => {
        const json = toCaseJson(item);
        const user = userMap.get(String(item.studentUserId));
        const chat = chatMap.get(String(item.studentUserId));
        const lastMessage = chat?.messages?.length ? chat.messages[chat.messages.length - 1] : null;
        const lastRead = Number(chat?.counsellorLastReadAt || 0);
        return {
          ...json,
          student: user ? toStudentSummary(user) : { id: String(item.studentUserId), fullName: 'Student', email: '' },
          approvedSteps: json.journeySteps.filter((step) => step.status === 'approved').length,
          verifiedDocuments: json.documents.filter((doc) => doc.status === 'verified').length,
          lastMessage: lastMessage
            ? { sender: lastMessage.sender, text: lastMessage.text, createdAt: lastMessage.createdAt }
            : null,
          unreadCount: (chat?.messages || []).filter(
            (msg) => msg.sender === 'student' && Number(msg.createdAt) > lastRead
          ).length,
        };
      })
    );
  } catch (err) {
    next(err);
  }
}

export async function getCounsellorStudent(req, res, next) {
  try {
    const studentUserId = String(req.params.id || '');
    if (!mongoose.isValidObjectId(studentUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid student' });
    }
    const current = await StudyAbroadCase.findOne({
      counsellorId: req.counsellor.counsellorId,
      studentUserId,
    });
    if (!current) return res.status(404).json({ success: false, message: 'Student case not found' });
    const user = await PlatformUser.findById(studentUserId).select(
      'fullName email phone careerId dateOfBirth address profileCompletion resumeProfile'
    );
    if (!user) return res.status(404).json({ success: false, message: 'Student not found' });
    return success(res, { student: toStudentSummary(user, true), case: toCaseJson(current) });
  } catch (err) {
    next(err);
  }
}

export async function updateCounsellorJourney(req, res, next) {
  try {
    const current = await StudyAbroadCase.findOne({
      counsellorId: req.counsellor.counsellorId,
      studentUserId: req.params.id,
    });
    if (!current) return res.status(404).json({ success: false, message: 'Student case not found' });

    const allowed = new Set(['pending', 'in_progress', 'approved', 'rejected']);
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const byId = new Map(steps.map((step) => [step.id, step]));
    current.journeySteps = (current.journeySteps || []).map((step) => {
      const nextStep = byId.get(step.id);
      if (!nextStep || !allowed.has(nextStep.status)) return step;
      return {
        ...(typeof step.toObject === 'function' ? step.toObject() : step),
        status: nextStep.status,
        counsellorNote: nextStep.counsellorNote ?? step.counsellorNote,
        updatedAt: new Date(),
      };
    });
    await current.save();
    return success(res, toCaseJson(current), 'Journey updated');
  } catch (err) {
    next(err);
  }
}

export async function updateCounsellorDocument(req, res, next) {
  try {
    const current = await StudyAbroadCase.findOne({
      counsellorId: req.counsellor.counsellorId,
      studentUserId: req.params.id,
    });
    if (!current) return res.status(404).json({ success: false, message: 'Student case not found' });
    const status = String(req.body?.status || '');
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid document status' });
    }
    const doc = (current.documents || []).find((item) => item.id === req.params.documentId);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    doc.status = status;
    doc.reviewedAt = new Date();
    await current.save();
    return success(res, toCaseJson(current), 'Document updated');
  } catch (err) {
    next(err);
  }
}

function toChatJson(doc) {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const lastRead = Number(obj.counsellorLastReadAt || 0);
  return {
    studentUserId: String(obj.studentUserId),
    counsellorId: String(obj.counsellorId),
    messages: (obj.messages || []).slice(-200).map((item) => ({
      id: item.id,
      sender: item.sender,
      text: item.text,
      createdAt: item.createdAt,
    })),
    unreadCount: (obj.messages || []).filter(
      (item) => item.sender === 'student' && Number(item.createdAt) > lastRead
    ).length,
  };
}

async function getAssignedCase(counsellorId, studentUserId) {
  if (!mongoose.isValidObjectId(studentUserId)) return null;
  return StudyAbroadCase.findOne({ counsellorId, studentUserId });
}

export async function getCounsellorChat(req, res, next) {
  try {
    const studentUserId = String(req.params.id || '');
    const current = await getAssignedCase(req.counsellor.counsellorId, studentUserId);
    if (!current) return res.status(404).json({ success: false, message: 'Student case not found' });

    let chat = await StudyAbroadChat.findOne({ studentUserId });
    if (!chat) {
      chat = await StudyAbroadChat.create({
        studentUserId,
        counsellorId: req.counsellor.counsellorId,
        messages: [],
      });
    }
    chat.counsellorLastReadAt = Date.now();
    await chat.save();
    return success(res, toChatJson(chat));
  } catch (err) {
    next(err);
  }
}

export async function sendCounsellorChat(req, res, next) {
  try {
    const studentUserId = String(req.params.id || '');
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'Message is required' });
    const current = await getAssignedCase(req.counsellor.counsellorId, studentUserId);
    if (!current) return res.status(404).json({ success: false, message: 'Student case not found' });

    let chat = await StudyAbroadChat.findOne({ studentUserId });
    if (!chat) {
      chat = await StudyAbroadChat.create({
        studentUserId,
        counsellorId: req.counsellor.counsellorId,
        messages: [],
      });
    }
    chat.messages = [
      ...(chat.messages || []),
      {
        id: `msg-${Date.now()}`,
        sender: 'counsellor',
        text: text.slice(0, 2000),
        createdAt: Date.now(),
      },
    ].slice(-200);
    chat.counsellorLastReadAt = Date.now();
    chat.counsellorId = req.counsellor.counsellorId;
    await chat.save();
    return success(res, toChatJson(chat), 'Sent');
  } catch (err) {
    next(err);
  }
}
