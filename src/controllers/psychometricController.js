import PsychometricSubmission from '../models/PsychometricSubmission.js';
import PlatformUser from '../models/PlatformUser.js';
import { success, paginated } from '../utils/apiResponse.js';

function extractIdentityFromReport(report) {
  const cover = report?.reportJson?.fullTemplate?.cover || {};
  const firstName = cover.studentFirstName || '';
  const lastName = cover.studentLastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    fullName,
    careerId: cover.careerId || '',
  };
}

function sanitizeDisplayEmail(email) {
  if (!email) return '';
  if (email.toLowerCase().endsWith('@recovered.ilc')) return '';
  return email;
}

function toListItem(doc, userMap) {
  const user = userMap[doc.userId?.toString()] || {};
  const reportJson = doc.reportJson || {};
  const cover = reportJson.fullTemplate?.cover || {};
  const identity = extractIdentityFromReport(doc);
  return {
    _id: doc._id,
    userId: doc.userId,
    studentName: user.fullName || identity.fullName || 'Unknown',
    studentEmail: sanitizeDisplayEmail(user.email),
    careerId: user.careerId || identity.careerId || '',
    grade: doc.grade,
    reportShareId: doc.reportShareId || '',
    reportStatus: doc.reportStatus || '',
    profileType: reportJson.profileType || cover.profileTypeLine || '',
    score: doc.score,
    attention: doc.attention,
    answered: doc.answered,
    total: doc.total,
    constructCount: doc.constructScores?.length || 0,
    completedAt: doc.reportGeneratedAt || doc.createdAt,
    createdAt: doc.createdAt,
  };
}

function toReportDetail(doc, user) {
  const reportJson = doc.reportJson || {};
  const fullTemplate = reportJson.fullTemplate || {};

  return {
    _id: doc._id,
    userId: doc.userId,
    student: user
      ? {
          _id: user._id,
          fullName: user.fullName,
          email: sanitizeDisplayEmail(user.email),
          careerId: user.careerId || '',
          profileSegment: user.profileCompletion?.profileSegment || '',
        }
      : (() => {
          const identity = extractIdentityFromReport(doc);
          return identity.fullName
            ? { _id: doc.userId, fullName: identity.fullName, email: '', careerId: identity.careerId, profileSegment: '' }
            : null;
        })(),
    grade: doc.grade,
    reportShareId: doc.reportShareId || '',
    shareIdTail: doc.shareIdTail || '',
    reportStatus: doc.reportStatus,
    reportError: doc.reportError || '',
    answered: doc.answered,
    total: doc.total,
    score: doc.score,
    attention: doc.attention,
    constructScores: doc.constructScores || [],
    reportGeneratedAt: doc.reportGeneratedAt,
    createdAt: doc.createdAt,
    summary: {
      title: reportJson.title || '',
      subtitle: reportJson.subtitle || '',
      profileType: reportJson.profileType || '',
      dataQualityNote: reportJson.dataQualityNote || '',
      topStrengths: reportJson.topStrengths || [],
      growthAreas: reportJson.growthAreas || [],
      streamDirections: reportJson.streamDirections || [],
      actionPlan30Days: reportJson.actionPlan30Days || [],
      counsellorNotes: reportJson.counsellorNotes || [],
    },
    batteries: fullTemplate.profiles?.batteries || [],
    recommendations: fullTemplate.recommendations?.cards || [],
    personalisedRecommendations: fullTemplate.recommendations?.personalised || [],
    workStyle: fullTemplate.workStyle?.profile || null,
    futureReadiness: fullTemplate.futureReadiness?.metrics || [],
    snapshot: fullTemplate.snapshot || null,
    pathwayReport: fullTemplate.pathwayReport || null,
    cover: fullTemplate.cover || null,
    reportJson,
  };
}

export async function listPsychometricReports(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.grade) filter.grade = req.query.grade;
    if (req.query.reportStatus) filter.reportStatus = req.query.reportStatus;
    if (req.query.userId) filter.userId = req.query.userId;

    if (req.query.search) {
      const search = req.query.search;
      const users = await PlatformUser.find({
        role: { $exists: false },
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { careerId: { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();
      const userIds = users.map((u) => u._id);
      filter.$or = [
        { userId: { $in: userIds } },
        { reportShareId: { $regex: search, $options: 'i' } },
        { 'reportJson.profileType': { $regex: search, $options: 'i' } },
        { 'reportJson.fullTemplate.cover.studentFirstName': { $regex: search, $options: 'i' } },
        { 'reportJson.fullTemplate.cover.studentLastName': { $regex: search, $options: 'i' } },
        { 'reportJson.fullTemplate.cover.careerId': { $regex: search, $options: 'i' } },
        { 'reportJson.fullTemplate.cover.profileTypeLine': { $regex: search, $options: 'i' } },
      ];
    }

    const [reports, total] = await Promise.all([
      PsychometricSubmission.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PsychometricSubmission.countDocuments(filter),
    ]);

    const userIds = [...new Set(reports.map((r) => r.userId?.toString()).filter(Boolean))];
    const users = await PlatformUser.find({ _id: { $in: userIds } })
      .select('fullName email careerId')
      .lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    return paginated(
      res,
      reports.map((r) => toListItem(r, userMap)),
      { page, limit, total, pages: Math.ceil(total / limit) }
    );
  } catch (err) {
    next(err);
  }
}

export async function getPsychometricReport(req, res, next) {
  try {
    const report = await PsychometricSubmission.findById(req.params.id).lean();
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const user = await PlatformUser.findById(report.userId)
      .select('fullName email careerId profileCompletion.profileSegment')
      .lean();

    return success(res, toReportDetail(report, user));
  } catch (err) {
    next(err);
  }
}

export async function getPsychometricStats(req, res, next) {
  try {
    const [total, ready, pending, failed, byGrade] = await Promise.all([
      PsychometricSubmission.countDocuments({}),
      PsychometricSubmission.countDocuments({ reportStatus: 'ready' }),
      PsychometricSubmission.countDocuments({ reportStatus: 'pending' }),
      PsychometricSubmission.countDocuments({ reportStatus: 'failed' }),
      PsychometricSubmission.aggregate([
        { $group: { _id: '$grade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return success(res, {
      total,
      ready,
      pending,
      failed,
      byGrade: byGrade.map((g) => ({ grade: g._id, count: g.count })),
    });
  } catch (err) {
    next(err);
  }
}
