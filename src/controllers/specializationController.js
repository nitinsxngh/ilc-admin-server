import Specialization from '../models/Specialization.js';
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
    const item = await Specialization.create(req.body);
    return success(res, item, 'Specialization created', 201);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Specialization already exists' });
    }
    next(err);
  }
}

export async function updateSpecialization(req, res, next) {
  try {
    const item = await Specialization.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Specialization not found' });
    return success(res, item, 'Specialization updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteSpecialization(req, res, next) {
  try {
    const item = await Specialization.findByIdAndUpdate(
      req.params.id,
      { status: 'inactive' },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Specialization not found' });
    return success(res, null, 'Specialization deactivated');
  } catch (err) {
    next(err);
  }
}
