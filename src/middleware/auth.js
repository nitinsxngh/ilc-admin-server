import jwt from 'jsonwebtoken';
import IlcAdminUser from '../models/IlcAdminUser.js';
import { isSuperAdmin, hasPermission, hasAnyPermission } from '../constants/adminPermissions.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Load fresh admin user from DB on each request for up-to-date permissions */
export async function attachAdminUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const adminUser = await IlcAdminUser.findById(req.user.id)
      .select('-passwordHash')
      .populate('roleId', 'name slug category level');

    if (!adminUser || adminUser.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Account inactive or not found' });
    }

    req.adminUser = adminUser;
    req.user = {
      id: adminUser._id.toString(),
      email: adminUser.email,
      roleSlug: adminUser.roleSlug,
      roleName: adminUser.roleName,
      pageAccess: adminUser.pageAccess,
      isSuperAdmin: isSuperAdmin(adminUser.roleSlug),
    };
    next();
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to verify user' });
  }
}

/** Require super_admin role */
export function requireSuperAdmin(req, res, next) {
  if (!req.user?.isSuperAdmin && !isSuperAdmin(req.user?.roleSlug)) {
    return res.status(403).json({ success: false, message: 'Super Admin access required' });
  }
  next();
}

/** Require at least one of the given page permissions */
export function requirePermission(...permissionSlugs) {
  return (req, res, next) => {
    if (hasAnyPermission(req.user, permissionSlugs)) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  };
}

/** Legacy role check — kept for counsellor User model routes if needed */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

export { hasPermission, hasAnyPermission, isSuperAdmin };
