import 'dotenv/config';
import mongoose from 'mongoose';
import CounsellorUser from '../models/User.js';
import IlcAdminUser from '../models/IlcAdminUser.js';
import IlcAdminRole from '../models/IlcAdminRole.js';
import Counsellor from '../models/Counsellor.js';
import Specialization from '../models/Specialization.js';
import Availability from '../models/Availability.js';
import { connectDB } from '../config/db.js';
import { generateSlots, normalizeDate, getDatesInRange } from '../services/availabilityEngine.js';
import { ALL_PERMISSION_SLUGS } from '../constants/adminPermissions.js';
import { protectDashboardCollections } from '../utils/collectionGuards.js';
import { ADMIN_COLLECTIONS } from '../constants/collections.js';

const DEFAULT_ROLES = [
  { name: 'Super Admin', slug: 'super_admin', category: 'super_admin', level: 1, isSystem: true, description: 'Full system access' },
  { name: 'Admin', slug: 'admin', category: 'admin', level: 2, isSystem: true, description: 'Administrative access with configurable pages' },
  { name: 'Marketing Manager', slug: 'marketing_manager', category: 'user', level: 3, isSystem: true, description: 'Marketing team member' },
  { name: 'Researcher', slug: 'researcher', category: 'user', level: 3, isSystem: true, description: 'Research team member' },
  { name: 'Developer', slug: 'developer', category: 'user', level: 3, isSystem: true, description: 'Development team member' },
  { name: 'Tester', slug: 'tester', category: 'user', level: 3, isSystem: true, description: 'QA and testing team member' },
];

const SPECIALIZATIONS = [
  'Stream selection (8-12)',
  'Career pathways',
  'Psychometric report discussion',
  'Parent-student guidance',
  'College admissions',
  'Study abroad',
];

const COUNSELLORS = [
  {
    firstName: 'Isha',
    lastName: '',
    email: 'isha@ilc.com',
    designation: 'Career Counsellor',
    bio: 'I help students and parents make confident decisions about streams, careers, and next steps—with clarity, empathy, and practical planning.',
    experienceYears: 8,
    sessionFee: 999,
    sessionDuration: 45,
    languages: ['English', 'Hindi'],
    specializationNames: ['Stream selection (8-12)', 'Career pathways', 'Psychometric report discussion', 'Parent-student guidance'],
    isRecommended: true,
  },
  {
    firstName: 'Rahul',
    lastName: 'Mehta',
    email: 'rahul@ilc.com',
    designation: 'Senior Career Counsellor',
    bio: 'Specializing in engineering and medical career paths with 12+ years of experience guiding students through competitive exams and college selection.',
    experienceYears: 12,
    sessionFee: 1299,
    sessionDuration: 60,
    languages: ['English', 'Hindi', 'Gujarati'],
    specializationNames: ['Career pathways', 'College admissions'],
    isRecommended: false,
  },
  {
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya@ilc.com',
    designation: 'Study Abroad Counsellor',
    bio: 'Expert in international education pathways, university applications, and scholarship guidance for students aspiring to study abroad.',
    experienceYears: 6,
    sessionFee: 1499,
    sessionDuration: 45,
    languages: ['English', 'Hindi'],
    specializationNames: ['Study abroad', 'College admissions'],
    isRecommended: false,
  },
];

async function seedRoles() {
  const roles = {};
  for (const data of DEFAULT_ROLES) {
    const role = await IlcAdminRole.findOneAndUpdate(
      { slug: data.slug },
      { ...data, status: 'active' },
      { upsert: true, new: true }
    );
    roles[data.slug] = role;
  }
  console.log(`Seeded ${DEFAULT_ROLES.length} roles in ilc_admin_roles`);
  return roles;
}

async function seedAdminUsers(roles) {
  await IlcAdminUser.deleteMany({});

  const adminPassword = await IlcAdminUser.hashPassword('admin123');
  await IlcAdminUser.create({
    firstName: 'Super',
    lastName: 'Admin',
    email: 'admin@ilc.com',
    passwordHash: adminPassword,
    roleId: roles.super_admin._id,
    roleSlug: roles.super_admin.slug,
    roleName: roles.super_admin.name,
    pageAccess: ALL_PERMISSION_SLUGS,
    status: 'active',
  });
  console.log('Super Admin: admin@ilc.com / admin123');

  const sampleUsers = [
    {
      firstName: 'Alex',
      lastName: 'Admin',
      email: 'alex.admin@ilc.com',
      roleSlug: 'admin',
      pageAccess: ['dashboard', 'counsellors.list', 'bookings.all', 'bookings.upcoming'],
    },
    {
      firstName: 'Maya',
      lastName: 'Marketing',
      email: 'maya@ilc.com',
      roleSlug: 'marketing_manager',
      pageAccess: ['dashboard', 'bookings.all'],
    },
    {
      firstName: 'Raj',
      lastName: 'Research',
      email: 'raj@ilc.com',
      roleSlug: 'researcher',
      pageAccess: ['dashboard', 'psychometric.list', 'psychometric.view', 'specializations'],
    },
    {
      firstName: 'Dev',
      lastName: 'Team',
      email: 'dev@ilc.com',
      roleSlug: 'developer',
      pageAccess: ['dashboard', 'availability', 'specializations'],
    },
    {
      firstName: 'Tina',
      lastName: 'Tester',
      email: 'tina@ilc.com',
      roleSlug: 'tester',
      pageAccess: ['dashboard', 'bookings.all', 'bookings.completed'],
    },
  ];

  const userPassword = await IlcAdminUser.hashPassword('user123');
  for (const data of sampleUsers) {
    const role = roles[data.roleSlug];
    await IlcAdminUser.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      passwordHash: userPassword,
      roleId: role._id,
      roleSlug: role.slug,
      roleName: role.name,
      pageAccess: data.pageAccess,
      status: 'active',
    });
    console.log(`Sample user: ${data.email} / user123 (${role.name})`);
  }
}

async function seed() {
  await connectDB();
  protectDashboardCollections(mongoose.connection.db, { scriptName: 'npm run seed' });

  console.log('Seeding database (ilc_* collections only — never touches dashboard `users`)...');

  const roles = await seedRoles();
  await seedAdminUsers(roles);

  await Promise.all([
    Counsellor.deleteMany({}),
    Specialization.deleteMany({}),
    Availability.deleteMany({}),
  ]);

  // Counsellor login accounts live in ilc_counsellor_users — NOT dashboard `users`
  await CounsellorUser.deleteMany({});
  console.log(`Cleared ${ADMIN_COLLECTIONS.counsellorUsers}`);

  const specs = {};
  for (const name of SPECIALIZATIONS) {
    const spec = await Specialization.create({ name, status: 'active' });
    specs[name] = spec._id;
  }
  console.log(`Created ${SPECIALIZATIONS.length} specializations`);

  const counsellorPassword = await CounsellorUser.hashPassword('counsellor123');

  for (const data of COUNSELLORS) {
    const user = await CounsellorUser.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      passwordHash: counsellorPassword,
      role: 'counsellor',
      status: 'active',
    });

    const counsellor = await Counsellor.create({
      ...data,
      specializations: data.specializationNames.map((n) => specs[n]).filter(Boolean),
      status: 'active',
      userId: user._id,
    });

    user.counsellorId = counsellor._id;
    await user.save();

    const startDate = normalizeDate(new Date());
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 14);
    const dates = getDatesInRange(startDate, endDate, 'daily');

    for (const date of dates) {
      const slots = generateSlots('10:00 AM', '6:00 PM', data.sessionDuration);
      await Availability.create({
        counsellorId: counsellor._id,
        date: normalizeDate(date),
        startTime: '10:00',
        endTime: '18:00',
        slotDuration: data.sessionDuration,
        slots,
        type: 'available',
        status: 'active',
      });
    }

    console.log(`Created counsellor: ${data.firstName} with 15 days availability`);
  }

  console.log('Seed completed successfully!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
