import Specialization from '../models/Specialization.js';
import Counsellor from '../models/Counsellor.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { success } from '../utils/apiResponse.js';

export async function listSpecializations(req, res, next) {
  try {
    const filter = req.query.all ? {} : { status: 'active' };
    const items = await Specialization.find(filter).sort({ name: 1 });
    return success(res, items);
  } catch (err) {
    next(err);
  }
}

export async function createSpecialization(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const duplicate = await Specialization.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Specialization already exists' });
    }

    const item = await Specialization.create({ ...req.body, name });
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SPECIALIZATION_CREATED,
      description: `Created specialization "${name}"`,
      entityType: 'specialization',
      entityId: item._id,
    });
    return success(res, item, 'Specialization created', 201);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Specialization already exists' });
    }
    next(err);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function softDeleteSpecialization(req, res, next) {
  try {
    const item = await Specialization.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Specialization not found' });
    }
    if (item.status === 'inactive') {
      return res.status(400).json({ success: false, message: 'Specialization is already inactive' });
    }

    item.status = 'inactive';
    await item.save();
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SPECIALIZATION_DEACTIVATED,
      description: `Deactivated specialization "${item.name}"`,
      entityType: 'specialization',
      entityId: item._id,
    });
    return success(res, item, 'Specialization deactivated');
  } catch (err) {
    next(err);
  }
}

export async function permanentDeleteSpecialization(req, res, next) {
  try {
    const item = await Specialization.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Specialization not found' });
    }

    const inUse = await Counsellor.countDocuments({
      specializations: item._id,
      deletedAt: null,
    });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot permanently delete: assigned to ${inUse} counsellor(s). Remove it from counsellors first.`,
      });
    }

    await Specialization.findByIdAndDelete(item._id);
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.SPECIALIZATION_PERMANENTLY_DELETED,
      description: `Permanently deleted specialization "${item.name}"`,
      entityType: 'specialization',
      entityId: item._id,
    });
    return success(res, null, 'Specialization permanently deleted');
  } catch (err) {
    next(err);
  }
}
