import IlcAdminUser from '../models/IlcAdminUser.js';
import IlcAdminRole from '../models/IlcAdminRole.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { success, paginated } from '../utils/apiResponse.js';
import { generatePassword } from '../utils/generatePassword.js';
import { isSuperAdmin, ALL_PERMISSION_SLUGS } from '../constants/adminPermissions.js';

function sanitizePageAccess(pageAccess, roleSlug) {
  if (isSuperAdmin(roleSlug)) return ALL_PERMISSION_SLUGS;
  if (!Array.isArray(pageAccess)) return [];
  return pageAccess.filter((slug) => ALL_PERMISSION_SLUGS.includes(slug));
}

function toPublicUser(user) {
  const obj = user.toObject ? user.toObject() : user;
  return {
    ...obj,
    pageAccess: isSuperAdmin(obj.roleSlug) ? ALL_PERMISSION_SLUGS : obj.pageAccess,
    passwordHash: undefined,
  };
}

export async function listAdminUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.roleSlug) filter.roleSlug = req.query.roleSlug;
    if (req.query.search) {
      filter.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      IlcAdminUser.find(filter)
        .select('-passwordHash')
        .populate('roleId', 'name slug category level')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      IlcAdminUser.countDocuments(filter),
    ]);

    return paginated(
      res,
      users.map(toPublicUser),
      { page, limit, total, pages: Math.ceil(total / limit) }
    );
  } catch (err) {
    next(err);
  }
}

export async function getAdminUser(req, res, next) {
  try {
    const user = await IlcAdminUser.findById(req.params.id)
      .select('-passwordHash')
      .populate('roleId', 'name slug category level');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return success(res, toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

export async function createAdminUser(req, res, next) {
  try {
    const { firstName, lastName, email, password, roleId, pageAccess, status } = req.body;

    const existing = await IlcAdminUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const role = await IlcAdminRole.findById(roleId);
    if (!role || role.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const plainPassword = password || generatePassword();
    const passwordHash = await IlcAdminUser.hashPassword(plainPassword);

    const user = await IlcAdminUser.create({
      firstName,
      lastName: lastName || '',
      email: email.toLowerCase(),
      passwordHash,
      roleId: role._id,
      roleSlug: role.slug,
      roleName: role.name,
      pageAccess: sanitizePageAccess(pageAccess, role.slug),
      status: status || 'active',
      createdBy: req.adminUser?._id || null,
    });

    const populated = await IlcAdminUser.findById(user._id)
      .select('-passwordHash')
      .populate('roleId', 'name slug category level');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ADMIN_USER_CREATED,
      description: `Created admin user ${user.firstName} ${user.lastName}`.trim() + ` (${user.email})`,
      entityType: 'admin_user',
      entityId: user._id,
      metadata: { roleSlug: user.roleSlug },
    });

    return success(
      res,
      {
        user: toPublicUser(populated),
        generatedPassword: password ? undefined : plainPassword,
      },
      'Admin user created',
      201
    );
  } catch (err) {
    next(err);
  }
}

export async function updateAdminUser(req, res, next) {
  try {
    const user = await IlcAdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (isSuperAdmin(user.roleSlug) && !isSuperAdmin(req.user.roleSlug)) {
      return res.status(403).json({ success: false, message: 'Cannot modify Super Admin' });
    }

    const { firstName, lastName, roleId, pageAccess, status, password } = req.body;

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;

    if (roleId) {
      const role = await IlcAdminRole.findById(roleId);
      if (!role) return res.status(400).json({ success: false, message: 'Invalid role' });
      if (isSuperAdmin(role.slug) && !isSuperAdmin(req.user.roleSlug)) {
        return res.status(403).json({ success: false, message: 'Cannot assign Super Admin role' });
      }
      user.roleId = role._id;
      user.roleSlug = role.slug;
      user.roleName = role.name;
    }

    if (pageAccess !== undefined) {
      user.pageAccess = sanitizePageAccess(pageAccess, user.roleSlug);
    }

    if (status !== undefined) {
      if (isSuperAdmin(user.roleSlug) && status === 'inactive') {
        return res.status(400).json({ success: false, message: 'Cannot deactivate Super Admin' });
      }
      user.status = status;
    }

    if (password) {
      user.passwordHash = await IlcAdminUser.hashPassword(password);
    }

    await user.save();

    const populated = await IlcAdminUser.findById(user._id)
      .select('-passwordHash')
      .populate('roleId', 'name slug category level');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ADMIN_USER_UPDATED,
      description: `Updated admin user ${user.firstName} ${user.lastName}`.trim() + ` (${user.email})`,
      entityType: 'admin_user',
      entityId: user._id,
    });

    return success(res, toPublicUser(populated), 'User updated');
  } catch (err) {
    next(err);
  }
}

export async function updateAdminUserStatus(req, res, next) {
  try {
    const user = await IlcAdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (isSuperAdmin(user.roleSlug)) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate Super Admin' });
    }

    user.status = req.body.status;
    await user.save();

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ADMIN_USER_STATUS_CHANGED,
      description: `Set admin user ${user.email} to ${req.body.status}`,
      entityType: 'admin_user',
      entityId: user._id,
      metadata: { status: req.body.status },
    });

    return success(res, toPublicUser(user), `User ${req.body.status}`);
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminUser(req, res, next) {
  try {
    const user = await IlcAdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (isSuperAdmin(user.roleSlug)) {
      return res.status(400).json({ success: false, message: 'Cannot delete Super Admin' });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    user.status = 'inactive';
    await user.save();

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.ADMIN_USER_DELETED,
      description: `Deactivated admin user ${user.email}`,
      entityType: 'admin_user',
      entityId: user._id,
    });

    return success(res, null, 'User deactivated');
  } catch (err) {
    next(err);
  }
}
