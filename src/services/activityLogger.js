import ActivityLog from '../models/ActivityLog.js';

function getClientIp(req) {
  if (!req) return '';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '';
}

function getActorFields(actor, req) {
  const adminUser = actor || req?.adminUser;
  if (!adminUser) {
    return {
      actorId: null,
      actorEmail: '',
      actorName: '',
    };
  }

  return {
    actorId: adminUser._id || null,
    actorEmail: adminUser.email || '',
    actorName: `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim(),
  };
}

export async function recordActivity({
  req,
  actor = null,
  action,
  description,
  entityType = '',
  entityId = null,
  metadata = {},
  actorEmail = '',
  actorName = '',
}) {
  const actorFields = getActorFields(actor, req);

  return ActivityLog.create({
    action,
    description,
    ...actorFields,
    actorEmail: actorFields.actorEmail || actorEmail,
    actorName: actorFields.actorName || actorName,
    entityType,
    entityId,
    metadata,
    ip: getClientIp(req),
    userAgent: req?.headers?.['user-agent'] || '',
  });
}

export function logActivity(payload) {
  recordActivity(payload).catch((err) => {
    console.error('Activity log failed:', err.message);
  });
}
