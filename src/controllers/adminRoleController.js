import IlcAdminRole from '../models/IlcAdminRole.js';
import { ADMIN_PERMISSIONS, getPermissionsByGroup } from '../constants/adminPermissions.js';
import { success } from '../utils/apiResponse.js';

export async function listRoles(req, res, next) {
  try {
    const roles = await IlcAdminRole.find({ status: 'active' }).sort({ level: 1, name: 1 });
    return success(res, roles);
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(req, res, next) {
  try {
    return success(res, {
      permissions: ADMIN_PERMISSIONS,
      grouped: getPermissionsByGroup(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createRole(req, res, next) {
  try {
    const { name, slug, category, description } = req.body;
    const role = await IlcAdminRole.create({
      name,
      slug: slug || name.toLowerCase().replace(/\s+/g, '_'),
      category: category || 'user',
      level: category === 'super_admin' ? 1 : category === 'admin' ? 2 : 3,
      description: description || '',
      isSystem: false,
    });
    return success(res, role, 'Role created', 201);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Role slug already exists' });
    }
    next(err);
  }
}
