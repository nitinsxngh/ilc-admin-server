import ActivityLog from '../models/ActivityLog.js';
import { ACTIVITY_ACTION_LABELS, ACTIVITY_ACTION_OPTIONS } from '../constants/activityActions.js';
import { paginated, success } from '../utils/apiResponse.js';

export async function listActivityLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.action) {
      filter.action = req.query.action;
    }

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    if (req.query.search) {
      const search = String(req.query.search).trim();
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { description: regex },
        { actorEmail: regex },
        { actorName: regex },
        { action: regex },
      ];
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
    ]);

    const data = logs.map((log) => ({
      ...log,
      actionLabel: ACTIVITY_ACTION_LABELS[log.action] || log.action,
    }));

    return paginated(res, data, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

export async function getActivityLogMeta(req, res, next) {
  try {
    return success(res, {
      actions: ACTIVITY_ACTION_OPTIONS,
    });
  } catch (err) {
    next(err);
  }
}
