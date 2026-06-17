/**
 * Dashboard page permissions — single source of truth for access management UI and API checks.
 * Slugs map to sidebar routes and API permission middleware.
 */

export const ADMIN_PERMISSIONS = [
  { slug: 'dashboard', label: 'Dashboard', group: 'General', route: '/dashboard' },
  { slug: 'counsellors.list', label: 'Counsellors List', group: 'Counsellors', route: '/counsellors' },
  { slug: 'counsellors.create', label: 'Add Counsellor', group: 'Counsellors', route: '/counsellors/new' },
  { slug: 'counsellors.edit', label: 'Edit Counsellor', group: 'Counsellors', route: '/counsellors' },
  { slug: 'availability', label: 'Availability', group: 'Counsellors', route: '/availability' },
  { slug: 'specializations', label: 'Specializations', group: 'Counsellors', route: '/specializations' },
  { slug: 'bookings.all', label: 'All Bookings', group: 'Bookings', route: '/bookings' },
  { slug: 'bookings.upcoming', label: 'Upcoming Bookings', group: 'Bookings', route: '/bookings' },
  { slug: 'bookings.completed', label: 'Completed Bookings', group: 'Bookings', route: '/bookings' },
  { slug: 'bookings.cancelled', label: 'Cancelled Bookings', group: 'Bookings', route: '/bookings' },
  { slug: 'psychometric.list', label: 'Psychometric Reports', group: 'Psychometric', route: '/psychometric' },
  { slug: 'psychometric.view', label: 'Report Detail', group: 'Psychometric', route: '/psychometric' },
  { slug: 'settings.users', label: 'User Access Management', group: 'Settings', route: '/settings/users' },
  { slug: 'settings.roles', label: 'Roles & Permissions', group: 'Settings', route: '/settings/roles' },
];

export const ALL_PERMISSION_SLUGS = ADMIN_PERMISSIONS.map((p) => p.slug);

export const SUPER_ADMIN_SLUG = 'super_admin';

export function isSuperAdmin(roleSlug) {
  return roleSlug === SUPER_ADMIN_SLUG;
}

export function hasPermission(user, permissionSlug) {
  if (!user) return false;
  if (isSuperAdmin(user.roleSlug)) return true;
  return Array.isArray(user.pageAccess) && user.pageAccess.includes(permissionSlug);
}

export function hasAnyPermission(user, permissionSlugs) {
  return permissionSlugs.some((slug) => hasPermission(user, slug));
}

export function getPermissionsByGroup() {
  const groups = {};
  for (const perm of ADMIN_PERMISSIONS) {
    if (!groups[perm.group]) groups[perm.group] = [];
    groups[perm.group].push(perm);
  }
  return groups;
}

/** Map API route areas to required permissions */
export const API_PERMISSION_MAP = {
  dashboard: ['dashboard'],
  counsellors: ['counsellors.list', 'counsellors.create', 'counsellors.edit'],
  availability: ['availability'],
  bookings: ['bookings.all', 'bookings.upcoming', 'bookings.completed', 'bookings.cancelled'],
  specializations: ['specializations'],
  psychometric: ['psychometric.list', 'psychometric.view'],
  adminUsers: ['settings.users'],
  adminRoles: ['settings.roles'],
};
