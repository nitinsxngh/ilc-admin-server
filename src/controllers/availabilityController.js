import Availability from '../models/Availability.js';
import Counsellor from '../models/Counsellor.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { success, paginated } from '../utils/apiResponse.js';
import {
  generateSlots,
  normalizeDate,
  getDatesInRange,
  groupSlotsByDate,
  bookableAvailabilityFilter,
} from '../services/availabilityEngine.js';

export async function listAvailability(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const filter = { status: 'active' };

    if (req.query.counsellorId) filter.counsellorId = req.query.counsellorId;
    if (req.query.type) {
      filter.type = req.query.type === 'available'
        ? { $in: ['available', 'recurring'] }
        : req.query.type;
    }
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = normalizeDate(req.query.from);
      if (req.query.to) filter.date.$lte = normalizeDate(req.query.to);
    }

    const [items, total] = await Promise.all([
      Availability.find(filter)
        .populate('counsellorId', 'firstName lastName email')
        .sort({ date: 1 })
        .skip(skip)
        .limit(limit),
      Availability.countDocuments(filter),
    ]);

    return paginated(res, items, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

export async function createAvailability(req, res, next) {
  try {
    const { counsellorId, date, startTime, endTime, slotDuration } = req.body;

    const counsellor = await Counsellor.findOne({ _id: counsellorId, deletedAt: null });
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    const normalizedDate = normalizeDate(date);
    const duration = slotDuration || counsellor.sessionDuration;
    const slots = generateSlots(startTime, endTime, duration);

    if (slots.length === 0) {
      return res.status(400).json({ success: false, message: 'No slots could be generated for this time range' });
    }

    const existing = await Availability.findOne(
      bookableAvailabilityFilter({ counsellorId, date: normalizedDate, status: 'active' })
    );

    if (existing) {
      existing.startTime = startTime;
      existing.endTime = endTime;
      existing.slotDuration = duration;
      existing.slots = slots;
      await existing.save();
      logActivity({
        req,
        action: ACTIVITY_ACTIONS.AVAILABILITY_UPDATED,
        description: `Updated availability for ${counsellor.firstName} on ${normalizedDate}`,
        entityType: 'availability',
        entityId: existing._id,
        metadata: { counsellorId, date: normalizedDate },
      });
      return success(res, existing, 'Availability updated');
    }

    const availability = await Availability.create({
      counsellorId,
      date: normalizedDate,
      startTime,
      endTime,
      slotDuration: duration,
      slots,
      type: 'available',
      createdBy: req.adminUser?._id,
    });

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.AVAILABILITY_CREATED,
      description: `Added availability for ${counsellor.firstName} on ${normalizedDate}`,
      entityType: 'availability',
      entityId: availability._id,
      metadata: { counsellorId, date: normalizedDate },
    });

    return success(res, availability, 'Availability created', 201);
  } catch (err) {
    next(err);
  }
}

export async function createRecurringAvailability(req, res, next) {
  try {
    const {
      counsellorId, startDate, endDate, startTime, endTime,
      slotDuration, frequency, daysOfWeek,
    } = req.body;

    const counsellor = await Counsellor.findOne({ _id: counsellorId, deletedAt: null });
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    const duration = slotDuration || counsellor.sessionDuration;
    const slots = generateSlots(startTime, endTime, duration);
    const dates = getDatesInRange(startDate, endDate, frequency, daysOfWeek);

    const created = [];
    for (const date of dates) {
      const normalizedDate = normalizeDate(date);
      const doc = await Availability.findOneAndUpdate(
        bookableAvailabilityFilter({ counsellorId, date: normalizedDate }),
        {
          counsellorId,
          date: normalizedDate,
          startTime,
          endTime,
          slotDuration: duration,
          slots,
          type: 'recurring',
          recurringPattern: { frequency, daysOfWeek, endDate: normalizeDate(endDate) },
          createdBy: req.adminUser?._id,
          status: 'active',
        },
        { upsert: true, new: true }
      );
      created.push(doc);
    }

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.AVAILABILITY_RECURRING_CREATED,
      description: `Added recurring availability for ${counsellor.firstName} (${created.length} dates)`,
      entityType: 'counsellor',
      entityId: counsellorId,
      metadata: { startDate, endDate, count: created.length },
    });

    return success(res, created, `Recurring availability created for ${created.length} dates`, 201);
  } catch (err) {
    next(err);
  }
}

export async function blockAvailability(req, res, next) {
  try {
    const { counsellorId, dates, reason } = req.body;
    const blocked = [];

    for (const dateStr of dates) {
      const date = normalizeDate(dateStr);
      const doc = await Availability.findOneAndUpdate(
        { counsellorId, date, type: 'blocked' },
        {
          counsellorId,
          date,
          startTime: '00:00',
          endTime: '23:59',
          slotDuration: 0,
          slots: [],
          type: 'blocked',
          blockReason: reason || '',
          createdBy: req.adminUser?._id,
          status: 'active',
        },
        { upsert: true, new: true }
      );
      blocked.push(doc);
    }

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.AVAILABILITY_BLOCKED,
      description: `Blocked ${blocked.length} date(s) for counsellor`,
      entityType: 'counsellor',
      entityId: counsellorId,
      metadata: { dates, reason: reason || '' },
    });

    return success(res, blocked, 'Dates blocked', 201);
  } catch (err) {
    next(err);
  }
}

export async function getAvailability(req, res, next) {
  try {
    const availability = await Availability.findOne({
      _id: req.params.id,
      status: 'active',
    }).populate('counsellorId', 'firstName lastName email sessionDuration');

    if (!availability) {
      return res.status(404).json({ success: false, message: 'Availability not found' });
    }

    return success(res, availability);
  } catch (err) {
    next(err);
  }
}

export async function updateAvailability(req, res, next) {
  try {
    const availability = await Availability.findOne({
      _id: req.params.id,
      status: 'active',
    });

    if (!availability) {
      return res.status(404).json({ success: false, message: 'Availability not found' });
    }

    if (availability.type === 'blocked') {
      if (req.body.blockReason !== undefined) {
        availability.blockReason = req.body.blockReason;
      }
      await availability.save();
      const populated = await Availability.findById(availability._id)
        .populate('counsellorId', 'firstName lastName email');
      logActivity({
        req,
        action: ACTIVITY_ACTIONS.AVAILABILITY_UPDATED,
        description: 'Updated availability block',
        entityType: 'availability',
        entityId: availability._id,
      });
      return success(res, populated, 'Block updated');
    }

    const { date, startTime, endTime, slotDuration } = req.body;
    const counsellor = await Counsellor.findOne({
      _id: availability.counsellorId,
      deletedAt: null,
    });
    if (!counsellor) {
      return res.status(404).json({ success: false, message: 'Counsellor not found' });
    }

    const nextStart = startTime || availability.startTime;
    const nextEnd = endTime || availability.endTime;
    const duration = slotDuration || availability.slotDuration || counsellor.sessionDuration;
    const newSlots = generateSlots(nextStart, nextEnd, duration);

    if (newSlots.length === 0) {
      return res.status(400).json({ success: false, message: 'No slots could be generated for this time range' });
    }

    const bookedSlots = availability.slots.filter((slot) => slot.isBooked);
    for (const booked of bookedSlots) {
      const match = newSlots.find(
        (slot) => slot.startTime === booked.startTime && slot.endTime === booked.endTime
      );
      if (!match) {
        return res.status(400).json({
          success: false,
          message: `Cannot update: booked slot ${booked.startTime}–${booked.endTime} would be removed. Cancel or reschedule bookings first.`,
        });
      }
      match.isBooked = true;
      match.bookingId = booked.bookingId;
    }

    if (date) availability.date = normalizeDate(date);
    availability.startTime = nextStart;
    availability.endTime = nextEnd;
    availability.slotDuration = duration;
    availability.slots = newSlots;
    await availability.save();

    const populated = await Availability.findById(availability._id)
      .populate('counsellorId', 'firstName lastName email');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.AVAILABILITY_UPDATED,
      description: 'Updated availability schedule',
      entityType: 'availability',
      entityId: availability._id,
    });

    return success(res, populated, 'Availability updated');
  } catch (err) {
    next(err);
  }
}

export async function deleteAvailability(req, res, next) {
  try {
    const availability = await Availability.findOne({
      _id: req.params.id,
      status: 'active',
    });

    if (!availability) {
      return res.status(404).json({ success: false, message: 'Availability not found' });
    }

    const bookedCount = availability.slots?.filter((slot) => slot.isBooked).length || 0;
    if (bookedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot remove: ${bookedCount} slot(s) are booked. Cancel or reschedule bookings first.`,
      });
    }

    availability.status = 'inactive';
    await availability.save();

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.AVAILABILITY_DELETED,
      description: availability.type === 'blocked' ? 'Removed availability block' : 'Removed availability schedule',
      entityType: 'availability',
      entityId: availability._id,
    });

    return success(res, null, availability.type === 'blocked' ? 'Block removed' : 'Availability removed');
  } catch (err) {
    next(err);
  }
}

export async function getCounsellorSlots(req, res, next) {
  try {
    const { counsellorId } = req.params;
    const { date } = req.query;

    const filter = bookableAvailabilityFilter({
      counsellorId,
      status: 'active',
      date: { $gte: normalizeDate(new Date()) },
    });

    if (date) filter.date = normalizeDate(date);

    const availabilities = await Availability.find(filter).sort({ date: 1 });
    const grouped = groupSlotsByDate(availabilities);

    return success(res, grouped);
  } catch (err) {
    next(err);
  }
}
