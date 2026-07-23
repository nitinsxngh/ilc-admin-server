import ActivityLog from '../models/ActivityLog.js';
import { ACTIVITY_ACTION_LABELS } from '../constants/activityActions.js';
import { success } from '../utils/apiResponse.js';

export async function listRecentNotifications(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 30);
    const since = req.query.since ? new Date(req.query.since) : null;

    const filter = since && !Number.isNaN(since.getTime()) ? { createdAt: { $gt: since } } : {};

    const [logs, unreadCount] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      since && !Number.isNaN(since.getTime())
        ? ActivityLog.countDocuments(filter)
        : Promise.resolve(0),
    ]);

    const notifications = logs.map((log) => ({
      _id: log._id,
      action: log.action,
      actionLabel: ACTIVITY_ACTION_LABELS[log.action] || log.action,
      description: log.description,
      actorName: log.actorName,
      actorEmail: log.actorEmail,
      createdAt: log.createdAt,
    }));

    return success(res, { notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}
