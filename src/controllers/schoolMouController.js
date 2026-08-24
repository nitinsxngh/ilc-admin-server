import SchoolMou from '../models/SchoolMou.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { success } from '../utils/apiResponse.js';

async function nextSequenceNumber() {
  const latest = await SchoolMou.findOne().sort({ sequenceNumber: -1 }).select('sequenceNumber');
  return (latest?.sequenceNumber || 0) + 1;
}

export async function listPublicSchoolMous(req, res, next) {
  try {
    const items = await SchoolMou.find({ status: 'active' })
      .sort({ schoolName: 1 })
      .select('schoolName price startDate expiryDate');
    return success(res, items);
  } catch (err) {
    next(err);
  }
}

export async function listSchoolMous(req, res, next) {
  try {
    const items = await SchoolMou.find().sort({ sequenceNumber: 1 });
    return success(res, items);
  } catch (err) {
    next(err);
  }
}

export async function createSchoolMou(req, res, next) {
  try {
    const sequenceNumber = await nextSequenceNumber();
    const item = await SchoolMou.create({
      sequenceNumber,
      schoolName: String(req.body.schoolName || '').trim(),
      startDate: req.body.startDate,
      expiryDate: req.body.expiryDate,
      price: Number(req.body.price),
      status: req.body.status === 'inactive' ? 'inactive' : 'active',
    });
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SCHOOL_MOU_CREATED,
      description: `Created MOU for "${item.schoolName}"`,
      entityType: 'school_mou',
      entityId: item._id,
    });
    return success(res, item, 'MOU created', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSchoolMou(req, res, next) {
  try {
    const item = await SchoolMou.findByIdAndUpdate(
      req.params.id,
      {
        schoolName: String(req.body.schoolName || '').trim(),
        startDate: req.body.startDate,
        expiryDate: req.body.expiryDate,
        price: Number(req.body.price),
        ...(req.body.status ? { status: req.body.status } : {}),
      },
      { new: true, runValidators: true }
    );
    if (!item) {
      return res.status(404).json({ success: false, message: 'MOU not found' });
    }
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SCHOOL_MOU_UPDATED,
      description: `Updated MOU for "${item.schoolName}"`,
      entityType: 'school_mou',
      entityId: item._id,
    });
    return success(res, item, 'MOU updated');
  } catch (err) {
    next(err);
  }
}

export async function updateSchoolMouStatus(req, res, next) {
  try {
    const { status } = req.body;
    const item = await SchoolMou.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!item) {
      return res.status(404).json({ success: false, message: 'MOU not found' });
    }
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SCHOOL_MOU_STATUS_CHANGED,
      description: `Marked MOU for "${item.schoolName}" as ${status}`,
      entityType: 'school_mou',
      entityId: item._id,
    });
    return success(res, item, `MOU ${status}`);
  } catch (err) {
    next(err);
  }
}

export async function deleteSchoolMou(req, res, next) {
  try {
    const item = await SchoolMou.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'MOU not found' });
    }
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SCHOOL_MOU_DELETED,
      description: `Deleted MOU for "${item.schoolName}"`,
      entityType: 'school_mou',
      entityId: item._id,
    });
    return success(res, null, 'MOU deleted');
  } catch (err) {
    next(err);
  }
}
