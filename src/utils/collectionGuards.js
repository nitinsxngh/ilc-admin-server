import { PROTECTED_DASHBOARD_COLLECTIONS } from '../constants/collections.js';

/**
 * Wraps db.collection() so seed/admin bootstrap scripts cannot accidentally
 * read-modify-write ILC-Dashboard collections (especially `users`).
 */
export function protectDashboardCollections(db, { scriptName = 'script' } = {}) {
  const originalCollection = db.collection.bind(db);

  db.collection = (name, ...args) => {
    if (PROTECTED_DASHBOARD_COLLECTIONS.has(name)) {
      throw new Error(
        `${scriptName} blocked: "${name}" belongs to ILC-Dashboard and must not be modified. ` +
          'Use ilc_* prefixed collections for admin data (e.g. ilc_counsellor_users, ilc_admin_users).'
      );
    }
    return originalCollection(name, ...args);
  };

  return db;
}
