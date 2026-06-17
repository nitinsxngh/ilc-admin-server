import Counsellor from '../models/Counsellor.js';
import CounsellorUser from '../models/User.js';
import Availability from '../models/Availability.js';
import { generatePassword } from '../utils/generatePassword.js';
import { success, paginated } from '../utils/apiResponse.js';
import { groupSlotsByDate, normalizeDate } from '../services/availabilityEngine.js';

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

    return paginated(res, counsellors, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

export async function getPublicCounsellors(req, res, next) {
  try {
    const counsellors = await Counsellor.find({ status: 'active', deletedAt: null })
      .populate('specializations', 'name')
      .sort({ isRecommended: -1, firstName: 1 });

    return success(res, counsellors);
  } catch (err) {
    next(err);
  }
}

export async function getCounsellor(req, res, next) {
  try {
    const counsellor = await Counsellor.findOne({ _id: req.params.id, deletedAt: null })
      .populate('specializations', 'name');
    if (!counsellor) return res.status(404).json({ success: false, message: 'Counsellor not found' });
    return success(res, counsellor);
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
    const availabilities = await Availability.find({
      counsellorId: counsellor._id,
      date: { $gte: today },
      type: 'available',
      status: 'active',
    }).sort({ date: 1 });

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

    return success(res, { counsellor, availability: availabilityByDate });
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

    return success(res, { counsellor: populated, generatedPassword: password ? undefined : plainPassword }, 'Counsellor created', 201);
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
    return success(res, populated, 'Counsellor updated');
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

    return success(res, counsellor, `Counsellor ${status}`);
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

    return success(res, null, 'Counsellor deleted');
  } catch (err) {
    next(err);
  }
}
