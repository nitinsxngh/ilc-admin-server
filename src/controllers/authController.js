import jwt from 'jsonwebtoken';
import IlcAdminUser from '../models/IlcAdminUser.js';
import { success } from '../utils/apiResponse.js';
import { isSuperAdmin, ALL_PERMISSION_SLUGS } from '../constants/adminPermissions.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      roleSlug: user.roleSlug,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function toAuthUser(user) {
  const pageAccess = isSuperAdmin(user.roleSlug) ? ALL_PERMISSION_SLUGS : user.pageAccess;
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    roleSlug: user.roleSlug,
    roleName: user.roleName,
    pageAccess,
    isSuperAdmin: isSuperAdmin(user.roleSlug),
  };
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await IlcAdminUser.findOne({ email: email.toLowerCase() });
    if (!user || user.status !== 'active') {
      logActivity({
        req,
        action: ACTIVITY_ACTIONS.AUTH_LOGIN_FAILED,
        description: `Failed sign in attempt for ${email.toLowerCase()}`,
        actorEmail: email.toLowerCase(),
        metadata: { reason: 'invalid_credentials' },
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      logActivity({
        req,
        action: ACTIVITY_ACTIONS.AUTH_LOGIN_FAILED,
        description: `Failed sign in attempt for ${user.email}`,
        actor: user,
        metadata: { reason: 'invalid_password' },
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    logActivity({
      req,
      actor: user,
      action: ACTIVITY_ACTIONS.AUTH_LOGIN,
      description: `${user.firstName} ${user.lastName}`.trim() + ` signed in`,
      entityType: 'admin_user',
      entityId: user._id,
    });

    const token = signToken(user);
    return success(res, { token, user: toAuthUser(user) }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.AUTH_LOGOUT,
      description: `${req.adminUser.firstName} ${req.adminUser.lastName}`.trim() + ' signed out',
      entityType: 'admin_user',
      entityId: req.adminUser._id,
    });
    return success(res, null, 'Signed out');
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await IlcAdminUser.findById(req.user.id)
      .select('-passwordHash')
      .populate('roleId', 'name slug category level');
    if (!user || user.status !== 'active') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return success(res, toAuthUser(user));
  } catch (err) {
    next(err);
  }
}
