/**
 * EMERGENCY ONLY — writes to ILC-Dashboard `users` via raw MongoDB driver.
 * Not used by seed, ensure-admin, or any API route.
 * ILC-Dashboard/client/backend is not modified; this only affects shared DB `users` data.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';

const PLACEHOLDER_EMAIL_DOMAIN = 'recovered.ilc';

function gradeToSegment(grade) {
  if (grade === '8-10') return 'school-8-10';
  if (grade === '11-12') return 'school-11-12';
  return '';
}

function buildPlaceholderEmail(userId) {
  return `student+${userId.toString()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

async function migrateCounsellorAccounts(db) {
  const roleAccounts = await db.collection('users').find({ role: { $exists: true } }).toArray();
  if (!roleAccounts.length) {
    console.log('No counsellor/admin accounts to migrate from users collection.');
    return 0;
  }

  let migrated = 0;
  for (const account of roleAccounts) {
    const existing = await db.collection('ilc_counsellor_users').findOne({ _id: account._id });
    if (!existing) {
      const { __v, ...doc } = account;
      await db.collection('ilc_counsellor_users').insertOne(doc);
      migrated += 1;
    }
    await db.collection('users').deleteOne({ _id: account._id });
  }

  console.log(`Migrated ${migrated} counsellor/admin account(s) to ilc_counsellor_users.`);
  return migrated;
}

async function aggregateStudentIdentity(db) {
  const rows = await db.collection('psychometricsubmissions').aggregate([
    { $match: { userId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$userId',
        grade: { $first: '$grade' },
        firstName: { $first: '$reportJson.fullTemplate.cover.studentFirstName' },
        lastName: { $first: '$reportJson.fullTemplate.cover.studentLastName' },
        careerId: { $first: '$reportJson.fullTemplate.cover.careerId' },
        profileType: { $first: '$reportJson.profileType' },
        createdAt: { $first: '$createdAt' },
        reportCount: { $sum: 1 },
      },
    },
  ]).toArray();

  return Object.fromEntries(rows.map((r) => [r._id.toString(), r]));
}

async function aggregatePaymentGrades(db) {
  const rows = await db.collection('paymenttransactions').aggregate([
    { $match: { userId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$userId', grade: { $first: '$grade' }, paymentCount: { $sum: 1 } } },
  ]).toArray();

  return Object.fromEntries(rows.map((r) => [r._id.toString(), r]));
}

function buildStudentDoc(userId, identity, paymentMeta) {
  const id = userId.toString();
  const fullName = [identity?.firstName, identity?.lastName].filter(Boolean).join(' ').trim()
    || (paymentMeta ? `Student ${id.slice(-6)}` : `Student ${id.slice(-6)}`);
  const grade = identity?.grade || paymentMeta?.grade || '';
  const segment = gradeToSegment(grade);
  const now = identity?.createdAt || new Date();

  return {
    _id: new mongoose.Types.ObjectId(userId),
    email: buildPlaceholderEmail(userId),
    fullName,
    provider: 'local',
    careerId: identity?.careerId || '',
    profileCompleted: false,
    profileCompletion: segment
      ? {
          userType: 'school',
          profileSegment: segment,
          mobile: '',
          instituteName: '',
          courseTitle: '',
          yearOfStudy: '',
          completedAt: now,
        }
      : undefined,
    recoveredFromSeed: true,
    recoveredAt: new Date(),
    createdAt: now,
    updatedAt: now,
  };
}

async function restoreStudents(db) {
  const existingStudents = await db.collection('users')
    .find({ role: { $exists: false } })
    .project({ _id: 1, email: 1, recoveredFromSeed: 1 })
    .toArray();

  const existingIds = new Set(existingStudents.map((u) => u._id.toString()));
  const [identityMap, paymentMap] = await Promise.all([
    aggregateStudentIdentity(db),
    aggregatePaymentGrades(db),
  ]);

  const allIds = new Set([
    ...Object.keys(identityMap),
    ...Object.keys(paymentMap),
  ]);

  const toRestore = [...allIds].filter((id) => !existingIds.has(id));
  if (!toRestore.length) {
    console.log('No missing students to restore.');
    return { inserted: 0, skipped: existingStudents.length };
  }

  const docs = toRestore.map((id) =>
    buildStudentDoc(id, identityMap[id], paymentMap[id])
  );

  const result = await db.collection('users').insertMany(docs, { ordered: false });
  console.log(`Restored ${result.insertedCount} student user(s).`);

  const withNames = docs.filter((d) => d.fullName && !d.fullName.startsWith('Student ')).length;
  const withCareerId = docs.filter((d) => d.careerId).length;
  console.log(`  - With real names: ${withNames}`);
  console.log(`  - With career ID: ${withCareerId}`);
  console.log(`  - Placeholder emails: ${docs.length} (@${PLACEHOLDER_EMAIL_DOMAIN})`);

  return { inserted: result.insertedCount, skipped: existingStudents.length };
}

async function main() {
  await connectDB();
  const db = mongoose.connection.db;

  console.log('=== ILC Student User Restore ===\n');

  await migrateCounsellorAccounts(db);
  const stats = await restoreStudents(db);

  const totalStudents = await db.collection('users').countDocuments({ role: { $exists: false } });
  console.log(`\nDone. Dashboard students in users collection: ${totalStudents}`);
  console.log(
    'Note: Original emails/passwords cannot be recovered from psychometric data alone.',
    'Check MongoDB Atlas backup for full profile restoration if needed.'
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
