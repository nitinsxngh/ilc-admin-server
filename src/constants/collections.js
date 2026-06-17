/**
 * Collection naming — ILC-Admins vs ILC-Dashboard (shared MongoDB, separate ownership).
 *
 * ILC-Admins: read/write only ilc_* collections.
 * ILC-Dashboard: owns users, psychometricsubmissions, paymenttransactions, etc.
 *                ILC-Admins must NEVER write to those (see readOnlyDashboard plugin).
 *
 * No changes are made to ILC-Dashboard/client/backend — isolation is via collection names.
 */

/** Collections owned by ILC-Dashboard — read-only from ILC-Admins */
export const DASHBOARD_COLLECTIONS = {
  users: 'users',
  psychometricSubmissions: 'psychometricsubmissions',
  psychometricReportJobs: 'psychometricreportjobs',
  paymentTransactions: 'paymenttransactions',
  referralCodes: 'referralcodes',
  forgotPasswordOtps: 'forgotpasswordotps',
};

/** Collections owned by ILC-Admins — all prefixed with ilc_ */
export const ADMIN_COLLECTIONS = {
  adminUsers: 'ilc_admin_users',
  adminRoles: 'ilc_admin_roles',
  counsellorUsers: 'ilc_counsellor_users',
  counsellors: 'ilc_counsellors',
  specializations: 'ilc_specializations',
  availabilities: 'ilc_availabilities',
  bookings: 'ilc_bookings',
};

/** Old ILC-Admins names (pre-prefix) — migrate once with npm run migrate-collections */
export const LEGACY_ADMIN_COLLECTIONS = {
  counsellors: 'counsellors',
  specializations: 'specializations',
  availabilities: 'availabilities',
  bookings: 'bookings',
};

export const PROTECTED_DASHBOARD_COLLECTIONS = new Set(Object.values(DASHBOARD_COLLECTIONS));
