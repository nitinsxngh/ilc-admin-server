/**
 * One-time migration: copy admin data from unprefixed collections to ilc_* collections.
 * Safe to re-run — skips targets that already have documents.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ADMIN_COLLECTIONS, LEGACY_ADMIN_COLLECTIONS } from '../constants/collections.js';
import { protectDashboardCollections } from './collectionGuards.js';

const MIGRATIONS = [
  { from: LEGACY_ADMIN_COLLECTIONS.counsellors, to: ADMIN_COLLECTIONS.counsellors },
  { from: LEGACY_ADMIN_COLLECTIONS.specializations, to: ADMIN_COLLECTIONS.specializations },
  { from: LEGACY_ADMIN_COLLECTIONS.availabilities, to: ADMIN_COLLECTIONS.availabilities },
  { from: LEGACY_ADMIN_COLLECTIONS.bookings, to: ADMIN_COLLECTIONS.bookings },
];

async function migratePair(db, from, to) {
  const sourceCount = await db.collection(from).countDocuments();
  const targetCount = await db.collection(to).countDocuments();

  if (sourceCount === 0) {
    console.log(`  ${from} → ${to}: source empty, skipped`);
    return { copied: 0, sourceCount, targetCount };
  }

  if (targetCount > 0) {
    console.log(`  ${from} → ${to}: target already has ${targetCount} doc(s), skipped`);
    return { copied: 0, sourceCount, targetCount };
  }

  const docs = await db.collection(from).find({}).toArray();
  if (!docs.length) {
    console.log(`  ${from} → ${to}: nothing to copy`);
    return { copied: 0, sourceCount, targetCount };
  }

  await db.collection(to).insertMany(docs, { ordered: false });
  console.log(`  ${from} → ${to}: copied ${docs.length} document(s)`);
  return { copied: docs.length, sourceCount, targetCount };
}

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  protectDashboardCollections(db, { scriptName: 'npm run migrate-collections' });

  console.log('=== Migrate admin collections to ilc_* prefix ===\n');

  let totalCopied = 0;
  for (const { from, to } of MIGRATIONS) {
    const result = await migratePair(db, from, to);
    totalCopied += result.copied;
  }

  console.log(`\nDone. Migrated ${totalCopied} document(s) total.`);
  console.log('Legacy collections were left in place; remove manually after verifying the app.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
