/**
 * Non-destructive bootstrap: ensures roles + super admin exist in ilc_admin_* collections.
 * Safe to run without wiping counsellor data.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import IlcAdminUser from '../models/IlcAdminUser.js';
import IlcAdminRole from '../models/IlcAdminRole.js';
import { connectDB } from '../config/db.js';
import { ALL_PERMISSION_SLUGS } from '../constants/adminPermissions.js';
import { protectDashboardCollections } from './collectionGuards.js';

const DEFAULT_ROLES = [
  { name: 'Super Admin', slug: 'super_admin', category: 'super_admin', level: 1, isSystem: true, description: 'Full system access' },
  { name: 'Admin', slug: 'admin', category: 'admin', level: 2, isSystem: true, description: 'Administrative access with configurable pages' },
  { name: 'Marketing Manager', slug: 'marketing_manager', category: 'user', level: 3, isSystem: true, description: 'Marketing team member' },
  { name: 'Researcher', slug: 'researcher', category: 'user', level: 3, isSystem: true, description: 'Research team member' },
  { name: 'Developer', slug: 'developer', category: 'user', level: 3, isSystem: true, description: 'Development team member' },
  { name: 'Tester', slug: 'tester', category: 'user', level: 3, isSystem: true, description: 'QA and testing team member' },
];

async function ensure() {
  await connectDB();
  protectDashboardCollections(mongoose.connection.db, { scriptName: 'npm run ensure-admin' });

  const roles = {};
  for (const data of DEFAULT_ROLES) {
    roles[data.slug] = await IlcAdminRole.findOneAndUpdate(
      { slug: data.slug },
      { ...data, status: 'active' },
      { upsert: true, new: true }
    );
  }
  console.log('Roles ensured in ilc_admin_roles');

  const existing = await IlcAdminUser.findOne({ email: 'admin@ilc.com' });
  if (existing) {
    console.log('Super Admin already exists: admin@ilc.com');
  } else {
    const passwordHash = await IlcAdminUser.hashPassword('admin123');
    await IlcAdminUser.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@ilc.com',
      passwordHash,
      roleId: roles.super_admin._id,
      roleSlug: 'super_admin',
      roleName: 'Super Admin',
      pageAccess: ALL_PERMISSION_SLUGS,
      status: 'active',
    });
    console.log('Super Admin created: admin@ilc.com / admin123');
  }

  await mongoose.disconnect();
}

ensure().catch((err) => {
  console.error(err);
  process.exit(1);
});
