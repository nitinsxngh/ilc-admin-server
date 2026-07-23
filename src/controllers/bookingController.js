import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Availability from '../models/Availability.js';
import Counsellor from '../models/Counsellor.js';
import CounsellorPortalBooking from '../models/CounsellorPortalBooking.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { success, paginated } from '../utils/apiResponse.js';
import { normalizeDate, bookableAvailabilityFilter } from '../services/availabilityEngine.js';
import {
  loadPaymentContextForPortalBookings,
  resolvePaymentFields,
} from '../services/bookingPaymentEnrichment.js';

function mapPortalBooking(doc, counsellorMap, paymentMap, invoiceMap) {
  const counsellor = counsellorMap.get(String(doc.counsellorId)) || null;
  const paymentFields = resolvePaymentFields(doc, paymentMap, invoiceMap);
  return {
    _id: String(doc._id),
    source: 'portal',
    studentId: doc.userId || null,
    studentName: doc.studentName || '',
    studentEmail: doc.studentEmail || '',
    studentPhone: doc.studentPhone || '',
    counsellorId: counsellor
      ? {
          _id: counsellor._id,
          firstName: counsellor.firstName,
          lastName: counsellor.lastName,
          email: counsellor.email,
          designation: counsellor.designation,
        }
      : doc.counsellorId,
    counsellorName: doc.counsellorName || '',
    availabilityId: doc.availabilityId || '',
    slotId: doc.slotId || '',
    bookingDate: doc.sessionDate || doc.createdAt,
    startTime: '',
    endTime: '',
    sessionTimeLabel: doc.sessionTimeLabel || '',
    status: doc.status || '',
    sessionFee: doc.sessionFeeINR ?? paymentFields.amountINR ?? 0,
    meetingLink: '',
    notes: doc.statusMessage || '',
    bookingReference: doc.bookingReference || '',
    adminBookingId: doc.adminBookingId || '',
    isPreviewSlot: Boolean(doc.isPreviewSlot),
    ...paymentFields,
    createdAt: doc.createdAt,
  };
}

function mapAdminBooking(doc) {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    ...plain,
    source: 'admin',
    sessionTimeLabel: '',
    bookingReference: '',
    adminBookingId: String(plain._id),
    paymentStatus: plain.status === 'cancelled' ? 'n/a' : 'n/a',
    paidAt: null,
    razorpayOrderId: '',
    razorpayPaymentId: '',
    amountINR: plain.sessionFee ?? null,
    payment: null,
    invoice: null,
  };
}

export async function listBookings(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const status = String(req.query.status || '').trim();
    const counsellorId = String(req.query.counsellorId || '').trim();

    const adminFilter = {};
    const portalFilter = {};

    if (status) {
      adminFilter.status = status;
      portalFilter.status = status;
    }
    if (counsellorId) {
      adminFilter.counsellorId = counsellorId;
      portalFilter.counsellorId = counsellorId;
    }
    if (req.query.from || req.query.to) {
      adminFilter.bookingDate = {};
      if (req.query.from) adminFilter.bookingDate.$gte = normalizeDate(req.query.from);
      if (req.query.to) adminFilter.bookingDate.$lte = normalizeDate(req.query.to);

      portalFilter.sessionDate = {};
      if (req.query.from) portalFilter.sessionDate.$gte = String(req.query.from).slice(0, 10);
      if (req.query.to) portalFilter.sessionDate.$lte = String(req.query.to).slice(0, 10);
    }

    const fetchLimit = skip + limit;

    const [adminDocs, adminTotal, portalDocs, portalTotal, counsellors] = await Promise.all([
      Booking.find(adminFilter)
        .populate('counsellorId', 'firstName lastName email designation')
        .sort({ bookingDate: -1, startTime: -1 })
        .limit(fetchLimit)
        .lean(),
      Booking.countDocuments(adminFilter),
      CounsellorPortalBooking.find(portalFilter)
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean(),
      CounsellorPortalBooking.countDocuments(portalFilter),
      Counsellor.find({ deletedAt: null }).select('firstName lastName email designation').lean(),
    ]);

    const counsellorMap = new Map(counsellors.map((c) => [String(c._id), c]));
    const { paymentMap, invoiceMap } = await loadPaymentContextForPortalBookings(portalDocs);

    const adminMapped = adminDocs.map(mapAdminBooking);
    const adminIds = new Set(adminMapped.map((b) => String(b._id)));

    const portalMapped = portalDocs
      .filter((p) => !(p.adminBookingId && adminIds.has(String(p.adminBookingId))))
      .map((p) => mapPortalBooking(p, counsellorMap, paymentMap, invoiceMap));

    const merged = [...adminMapped, ...portalMapped]
      .sort((a, b) => {
        const aTime = new Date(a.bookingDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.bookingDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(skip, skip + limit);

    const total = adminTotal + portalTotal;

    return paginated(res, merged, {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    next(err);
  }
}

export async function getBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('counsellorId', 'firstName lastName email designation sessionFee')
      .populate('availabilityId');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return success(res, booking);
  } catch (err) {
    next(err);
  }
}

export async function createBooking(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { counsellorId, availabilityId, slotId, studentName, studentEmail, studentPhone } = req.body;

    const counsellor = await Counsellor.findOne({ _id: counsellorId, status: 'active', deletedAt: null }).session(session);
    if (!counsellor) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Counsellor not available' });
    }

    const availability = await Availability.findOne(
      bookableAvailabilityFilter({
        _id: availabilityId,
        counsellorId,
        status: 'active',
      })
    ).session(session);

    if (!availability) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Availability not found' });
    }

    const slot = availability.slots.id(slotId);
    if (!slot) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }

    if (slot.isBooked) {
      await session.abortTransaction();
      return res.status(409).json({ success: false, message: 'This slot is already booked' });
    }

    const booking = await Booking.create([{
      studentName,
      studentEmail: studentEmail || '',
      studentPhone: studentPhone || '',
      counsellorId,
      availabilityId,
      slotId,
      bookingDate: availability.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: 'confirmed',
      sessionFee: counsellor.sessionFee,
    }], { session });

    slot.isBooked = true;
    slot.bookingId = booking[0]._id;
    await availability.save({ session });

    await session.commitTransaction();

    const populated = await Booking.findById(booking[0]._id)
      .populate('counsellorId', 'firstName lastName email designation');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.BOOKING_CREATED,
      description: `Student booking created for ${studentName} with ${counsellor.firstName} ${counsellor.lastName}`.trim(),
      entityType: 'booking',
      entityId: booking[0]._id,
      actorName: studentName,
      actorEmail: studentEmail || '',
      metadata: {
        counsellorId,
        bookingDate: availability.date,
        startTime: slot.startTime,
      },
    });

    return success(res, populated, 'Booking confirmed', 201);
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
}

export async function updateBookingStatus(req, res, next) {
  try {
    const { status, notes, meetingLink } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const previousStatus = booking.status;
    booking.status = status;
    if (notes !== undefined) booking.notes = notes;
    if (meetingLink !== undefined) booking.meetingLink = meetingLink;

    if (status === 'cancelled' && previousStatus !== 'cancelled') {
      booking.cancelledAt = new Date();
      const availability = await Availability.findById(booking.availabilityId);
      if (availability) {
        const slot = availability.slots.id(booking.slotId);
        if (slot) {
          slot.isBooked = false;
          slot.bookingId = null;
          await availability.save();
        }
      }
    }

    if (status === 'completed') booking.completedAt = new Date();

    await booking.save();

    const populated = await Booking.findById(booking._id)
      .populate('counsellorId', 'firstName lastName email');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.BOOKING_STATUS_CHANGED,
      description: `Changed booking for ${booking.studentName} from ${previousStatus} to ${status}`,
      entityType: 'booking',
      entityId: booking._id,
      metadata: { previousStatus, status },
    });

    return success(res, populated, `Booking ${status}`);
  } catch (err) {
    next(err);
  }
}

export async function rescheduleBooking(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { availabilityId, slotId } = req.body;
    const booking = await Booking.findById(req.params.id).session(session);
    if (!booking) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const oldAvailability = await Availability.findById(booking.availabilityId).session(session);
    if (oldAvailability) {
      const oldSlot = oldAvailability.slots.id(booking.slotId);
      if (oldSlot) {
        oldSlot.isBooked = false;
        oldSlot.bookingId = null;
        await oldAvailability.save({ session });
      }
    }

    const newAvailability = await Availability.findById(availabilityId).session(session);
    if (!newAvailability) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'New availability not found' });
    }

    const newSlot = newAvailability.slots.id(slotId);
    if (!newSlot || newSlot.isBooked) {
      await session.abortTransaction();
      return res.status(409).json({ success: false, message: 'New slot is not available' });
    }

    newSlot.isBooked = true;
    newSlot.bookingId = booking._id;
    await newAvailability.save({ session });

    booking.availabilityId = availabilityId;
    booking.slotId = slotId;
    booking.bookingDate = newAvailability.date;
    booking.startTime = newSlot.startTime;
    booking.endTime = newSlot.endTime;
    booking.status = 'rescheduled';
    await booking.save({ session });

    await session.commitTransaction();

    const populated = await Booking.findById(booking._id)
      .populate('counsellorId', 'firstName lastName email');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.BOOKING_RESCHEDULED,
      description: `Rescheduled booking for ${booking.studentName}`,
      entityType: 'booking',
      entityId: booking._id,
      metadata: {
        availabilityId,
        slotId,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
      },
    });

    return success(res, populated, 'Booking rescheduled');
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
}
