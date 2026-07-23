import Counsellor from '../models/Counsellor.js';
import CounsellorUser from '../models/User.js';
import Availability from '../models/Availability.js';
import Booking from '../models/Booking.js';
import CounsellorPortalBooking from '../models/CounsellorPortalBooking.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { generatePassword } from '../utils/generatePassword.js';
import { success, paginated } from '../utils/apiResponse.js';
import { normalizeDate, groupSlotsByDate, bookableAvailabilityFilter } from '../services/availabilityEngine.js';
import {
  buildProfileImageKey,
  deleteObject,
  enrichCounsellorProfileImage,
  extractS3Key,
  getObject,
  uploadObject,
} from '../services/s3.js';
import {
  loadPaymentContextForPortalBookings,
  resolvePaymentFields,
} from '../services/bookingPaymentEnrichment.js';

function toPortalBookingSummary(doc, paymentMap = new Map(), invoiceMap = new Map()) {
  if (!doc) return null;
  const paymentFields = resolvePaymentFields(doc, paymentMap, invoiceMap);
  return {
    _id: doc._id,
    bookingReference: doc.bookingReference || '',
    status: doc.status || '',
    statusMessage: doc.statusMessage || '',
    sessionDate: doc.sessionDate || '',
    sessionDateLabel: doc.sessionDateLabel || '',
    sessionTimeLabel: doc.sessionTimeLabel || '',
    sessionFeeINR: doc.sessionFeeINR ?? null,
    sessionDurationMins: doc.sessionDurationMins ?? null,
    studentName: doc.studentName || '',
    studentEmail: doc.studentEmail || '',
    studentPhone: doc.studentPhone || '',
    adminBookingId: doc.adminBookingId || '',
    isPreviewSlot: Boolean(doc.isPreviewSlot),
    createdAt: doc.createdAt,
    ...paymentFields,
  };
}

function enrichAdminBooking(booking, portalByAdminId, portalBySlot, paymentMap, invoiceMap) {
  const plain = typeof booking.toObject === 'function' ? booking.toObject() : { ...booking };
  const adminId = String(plain._id);
  const portal =
    portalByAdminId.get(adminId) ||
    portalBySlot.get(`${plain.availabilityId}:${plain.slotId}`) ||
    null;
  const portalBooking = portal ? toPortalBookingSummary(portal, paymentMap, invoiceMap) : null;

  return {
    ...plain,
    portalBooking,
    paymentStatus: portalBooking?.paymentStatus || 'n/a',
    paidAt: portalBooking?.paidAt || null,
    razorpayOrderId: portalBooking?.razorpayOrderId || '',
    razorpayPaymentId: portalBooking?.razorpayPaymentId || '',
    amountINR: portalBooking?.amountINR ?? plain.sessionFee ?? null,
    payment: portalBooking?.payment || null,
    invoice: portalBooking?.invoice || null,
  };
}

export async function listCounsellors(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const filter = { deletedAt: null };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [counsellors, total] = await Promise.all([
      Counsellor.find(filter)
        .populate('specializations', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Counsellor.countDocuments(filter),
    ]);

    return paginated(res, counsellors.map(enrichCounsellorProfileImage), { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

export async function getPublicCounsellors(req, res, next) {
  try {
    const counsellors = await Counsellor.find({ status: 'active', deletedAt: null })
      .populate('specializations', 'name')
      .sort({ isRecommended: -1, firstName: 1 });

    return success(res, counsellors.map(enrichCounsellorProfileImage));
  } catch (err) {
    next(err);
  }
}

export async function getCounsellor(req, res, next) {
  try {
    const counsellor = await Counsellor.findOne({ _id: req.params.id, deletedAt: null })
      .populate('specializations', 'name');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });
    return success(res, enrichCounsellorProfileImage(counsellor));
  } catch (err) {
    next(err);
  }
}

export async function getCounsellorBookings(req, res, next) {
  try {
    const counsellorId = req.params.id;
    const counsellor = await Counsellor.findOne({ _id: counsellorId, deletedAt: null })
      .select('firstName lastName email designation status sessionFee profileImage')
      .lean();
    if (!counsellor) {
      return res.status(404).json({ success: false, message: 'Counsellor not found' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const filter = { counsellorId };
    if (req.query.status) filter.status = req.query.status;

    const [bookings, total, statusCounts, portalBookings] = await Promise.all([
      Booking.find(filter)
        .sort({ bookingDate: -1, startTime: -1 })
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
      Booking.aggregate([
        { $match: { counsellorId: counsellor._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      CounsellorPortalBooking.find({ counsellorId: String(counsellorId) })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
    ]);

    const portalByAdminId = new Map();
    const portalBySlot = new Map();
    for (const portal of portalBookings) {
      if (portal.adminBookingId) {
        portalByAdminId.set(String(portal.adminBookingId), portal);
      }
      if (portal.availabilityId && portal.slotId) {
        portalBySlot.set(`${portal.availabilityId}:${portal.slotId}`, portal);
      }
    }

    const { paymentMap, invoiceMap } = await loadPaymentContextForPortalBookings(portalBookings);

    const byStatus = Object.fromEntries(statusCounts.map((row) => [row._id, row.count]));
    const enriched = bookings.map((b) => ({
      ...enrichAdminBooking(b, portalByAdminId, portalBySlot, paymentMap, invoiceMap),
      source: 'admin',
    }));

    const representedPortalIds = new Set(
      enriched
        .map((b) => b.portalBooking?._id)
        .filter(Boolean)
        .map(String)
    );

    const orphanPortal = portalBookings
      .filter((p) => !representedPortalIds.has(String(p._id)))
      .map((p) => {
        const portalBooking = toPortalBookingSummary(p, paymentMap, invoiceMap);
        return {
          _id: String(p._id),
          source: 'portal',
          studentName: p.studentName || '',
          studentEmail: p.studentEmail || '',
          studentPhone: p.studentPhone || '',
          bookingDate: p.sessionDate || p.createdAt,
          startTime: '',
          endTime: '',
          sessionTimeLabel: p.sessionTimeLabel || '',
          status: p.status || '',
          sessionFee: p.sessionFeeINR ?? portalBooking?.amountINR ?? 0,
          meetingLink: '',
          notes: p.statusMessage || '',
          portalBooking,
          paymentStatus: portalBooking?.paymentStatus || 'unpaid',
          paidAt: portalBooking?.paidAt || null,
          razorpayOrderId: portalBooking?.razorpayOrderId || '',
          razorpayPaymentId: portalBooking?.razorpayPaymentId || '',
          amountINR: portalBooking?.amountINR ?? p.sessionFeeINR ?? null,
          payment: portalBooking?.payment || null,
          invoice: portalBooking?.invoice || null,
          bookingReference: p.bookingReference || '',
          createdAt: p.createdAt,
        };
      });

    const merged = [...enriched, ...orphanPortal].sort((a, b) => {
      const aTime = new Date(a.bookingDate || a.createdAt || 0).getTime();
      const bTime = new Date(b.bookingDate || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return success(res, {
      counsellor: enrichCounsellorProfileImage(counsellor),
      bookings: merged,
      stats: {
        total,
        portalTotal: portalBookings.length,
        byStatus,
        confirmed: byStatus.confirmed || 0,
        completed: byStatus.completed || 0,
        cancelled: byStatus.cancelled || 0,
        pending: byStatus.pending || 0,
        rescheduled: byStatus.rescheduled || 0,
        no_show: byStatus.no_show || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getCounsellorDetailForBooking(req, res, next) {
  try {
    const counsellor = await Counsellor.findOne({ _id: req.params.id, status: 'active', deletedAt: null })
      .populate('specializations', 'name');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    const today = normalizeDate(new Date());
    const availabilities = await Availability.find(
      bookableAvailabilityFilter({
        counsellorId: counsellor._id,
        date: { $gte: today },
        status: 'active',
      })
    ).sort({ date: 1 });

    const blockedDates = await Availability.find({
      counsellorId: counsellor._id,
      type: 'blocked',
      date: { $gte: today },
      status: 'active',
    }).select('date');

    const blockedSet = new Set(blockedDates.map((b) => normalizeDate(b.date).toISOString().split('T')[0]));

    const filtered = availabilities.filter(
      (a) => !blockedSet.has(normalizeDate(a.date).toISOString().split('T')[0])
    );

    const availabilityByDate = groupSlotsByDate(filtered);

    return success(res, { counsellor: enrichCounsellorProfileImage(counsellor), availability: availabilityByDate });
  } catch (err) {
    next(err);
  }
}

export async function createCounsellor(req, res, next) {
  try {
    const {
      firstName, lastName, email, password, phone, profileImage,
      designation, bio, experienceYears, sessionFee, sessionDuration,
      languages, specializations, status, isRecommended,
    } = req.body;

    const existing = await Counsellor.findOne({ email: email.toLowerCase(), deletedAt: null });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const plainPassword = password || generatePassword();
    const passwordHash = await CounsellorUser.hashPassword(plainPassword);

    const user = await CounsellorUser.create({
      firstName,
      lastName: lastName || '',
      email: email.toLowerCase(),
      passwordHash,
      role: 'counsellor',
      status: status === 'inactive' ? 'inactive' : 'active',
    });

    const counsellor = await Counsellor.create({
      firstName,
      lastName: lastName || '',
      email: email.toLowerCase(),
      phone: phone || '',
      profileImage: profileImage || '',
      designation: designation || 'Career Counsellor',
      bio: bio || '',
      experienceYears: experienceYears || 0,
      sessionFee,
      sessionDuration: sessionDuration || 45,
      languages: languages || [],
      specializations: specializations || [],
      status: status || 'active',
      isRecommended: isRecommended || false,
      userId: user._id,
    });

    user.counsellorId = counsellor._id;
    await user.save();

    const populated = await Counsellor.findById(counsellor._id).populate('specializations', 'name');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.COUNSELLOR_CREATED,
      description: `Created counsellor ${counsellor.firstName} ${counsellor.lastName}`.trim(),
      entityType: 'counsellor',
      entityId: counsellor._id,
      metadata: { email: counsellor.email },
    });

    return success(res, { counsellor: enrichCounsellorProfileImage(populated), generatedPassword: password ? undefined : plainPassword }, 'Counsellor created', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCounsellor(req, res, next) {
  try {
    const counsellor = await Counsellor.findOne({ _id: req.params.id, deletedAt: null });
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    const fields = [
      'firstName', 'lastName', 'phone', 'profileImage', 'designation', 'bio',
      'experienceYears', 'sessionFee', 'sessionDuration', 'languages',
      'specializations', 'status', 'isRecommended',
    ];

    for (const field of fields) {
      if (req.body[field] !== undefined) counsellor[field] = req.body[field];
    }

    await counsellor.save();

    if (counsellor.userId) {
      await CounsellorUser.findByIdAndUpdate(counsellor.userId, {
        firstName: counsellor.firstName,
        lastName: counsellor.lastName,
        status: counsellor.status === 'active' ? 'active' : 'inactive',
      });
    }

    const populated = await Counsellor.findById(counsellor._id).populate('specializations', 'name');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.COUNSELLOR_UPDATED,
      description: `Updated counsellor ${counsellor.firstName} ${counsellor.lastName}`.trim(),
      entityType: 'counsellor',
      entityId: counsellor._id,
    });

    return success(res, enrichCounsellorProfileImage(populated), 'Counsellor updated');
  } catch (err) {
    next(err);
  }
}

export async function updateCounsellorStatus(req, res, next) {
  try {
    const { status } = req.body;
    const counsellor = await Counsellor.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { status },
      { new: true }
    ).populate('specializations', 'name');

    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    if (counsellor.userId) {
      await CounsellorUser.findByIdAndUpdate(counsellor.userId, {
        status: status === 'active' ? 'active' : 'inactive',
      });
    }

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.COUNSELLOR_STATUS_CHANGED,
      description: `Set counsellor ${counsellor.firstName} ${counsellor.lastName}`.trim() + ` to ${status}`,
      entityType: 'counsellor',
      entityId: counsellor._id,
      metadata: { status },
    });

    return success(res, enrichCounsellorProfileImage(counsellor), `Counsellor ${status}`);
  } catch (err) {
    next(err);
  }
}

export async function deleteCounsellor(req, res, next) {
  try {
    const counsellor = await Counsellor.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { deletedAt: new Date(), status: 'inactive' },
      { new: true }
    );
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });

    if (counsellor.userId) {
      await CounsellorUser.findByIdAndUpdate(counsellor.userId, { status: 'inactive' });
    }

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.COUNSELLOR_DELETED,
      description: `Deleted counsellor ${counsellor.firstName} ${counsellor.lastName}`.trim(),
      entityType: 'counsellor',
      entityId: counsellor._id,
    });

    return success(res, null, 'Counsellor deleted');
  } catch (err) {
    next(err);
  }
}

export async function streamCounsellorProfileImage(req, res, next) {
  try {
    const counsellor = await Counsellor.findOne({ _id: req.params.id, deletedAt: null });
    if (!counsellor?.profileImage) {
      return res.status(404).json({ success: false, message: 'Profile image not found' });
    }

    const key = extractS3Key(counsellor.profileImage);
    const { body, contentType } = await getObject(key);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    body.pipe(res);
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ success: false, message: 'Profile image not found' });
    }
    next(err);
  }
}

export async function uploadCounsellorProfileImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }

    const counsellor = await Counsellor.findOne({ _id: req.params.id, deletedAt: null });
    if (!counsellor) {
      return res.status(404).json({ success: false, message: 'Counsellor not found' });
    }

    const key = buildProfileImageKey(counsellor._id, req.file.mimetype);
    await uploadObject(key, req.file.buffer, req.file.mimetype);

    const oldKey = extractS3Key(counsellor.profileImage);
    counsellor.profileImage = key;
    await counsellor.save();

    if (oldKey && oldKey !== key) {
      try {
        await deleteObject(oldKey);
      } catch {
        // Non-fatal if old image cleanup fails
      }
    }

    const populated = await Counsellor.findById(counsellor._id).populate('specializations', 'name');

    logActivity({
      req,
      action: ACTIVITY_ACTIONS.COUNSELLOR_PROFILE_IMAGE_UPDATED,
      description: `Updated profile image for ${counsellor.firstName} ${counsellor.lastName}`.trim(),
      entityType: 'counsellor',
      entityId: counsellor._id,
    });

    return success(res, enrichCounsellorProfileImage(populated), 'Profile image updated');
  } catch (err) {
    next(err);
  }
}
