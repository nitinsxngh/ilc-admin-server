/**
 * Mongoose plugin: blocks all writes to ILC-Dashboard collections from ILC-Admins.
 * Dashboard data is read-only here — ILC-Dashboard/backend owns those collections.
 */
export function readOnlyDashboardPlugin(schema) {
  const block = function blockDashboardWrite(next) {
    next(
      new Error(
        'This collection belongs to ILC-Dashboard and is read-only in ILC-Admins. ' +
          'Do not modify ILC-Dashboard data from the admin backend.'
      )
    );
  };

  schema.pre('save', block);
  schema.pre('insertMany', block);
  schema.pre('updateOne', block);
  schema.pre('updateMany', block);
  schema.pre('findOneAndUpdate', block);
  schema.pre('findOneAndDelete', block);
  schema.pre('findOneAndReplace', block);
  schema.pre('deleteOne', block);
  schema.pre('deleteMany', block);
}
