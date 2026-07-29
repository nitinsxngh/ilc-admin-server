import PsychometricSubmission from '../models/PsychometricSubmission.js';
import CdaV2Submission from '../models/CdaV2Submission.js';
import PsychometricAnalyticsLog from '../models/PsychometricAnalyticsLog.js';
import PlatformUser from '../models/PlatformUser.js';
import { ACTIVITY_ACTIONS } from '../constants/activityActions.js';
import { logActivity } from '../services/activityLogger.js';
import { success, paginated } from '../utils/apiResponse.js';

const REPORT_MODE_AI = 'ai';
const REPORT_MODE_MANUAL = 'manual';

function studentPortalBase() {
  return String(process.env.STUDENT_PORTAL_URL || '').trim().replace(/\/$/, '');
}

function buildReportUrl(reportMode, grade, reportShareId) {
  const shareId = String(reportShareId || '').trim();
  if (!shareId) return '';

  const base = studentPortalBase();
  if (!base) return '';

  const params = new URLSearchParams({ shareId });
  if (grade) params.set('grade', grade);
  const path =
    reportMode === REPORT_MODE_MANUAL
      ? '/discover/psychometric/report-v2'
      : '/discover/psychometric/report';

  return `${base}${path}?${params.toString()}`;
}

function toAnalyticsLogSummary(log) {
  if (!log) return null;
  const responses = Array.isArray(log.responses) ? log.responses : [];
  const times = responses.map((r) => Number(r.timeSpendMs) || 0);
  const avgTimeMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const slowest = [...responses]
    .map((r) => ({
      questionId: r.questionId,
      selectedKey: r.selectedKey,
      timeSpendMs: Number(r.timeSpendMs) || 0,
    }))
    .sort((a, b) => b.timeSpendMs - a.timeSpendMs)
    .slice(0, 10);

  return {
    _id: log._id,
    grade: log.grade,
    lang: log.lang || 'en',
    sessionId: log.sessionId || '',
    breakCount: log.breakCount ?? 0,
    answered: log.answered,
    total: log.total,
    totalTimeMs: log.totalTimeMs ?? 0,
    avgTimeMs,
    completedAt: log.completedAt || log.createdAt,
    createdAt: log.createdAt,
    responseCount: responses.length,
    slowestQuestions: slowest,
    responses,
  };
}

async function findMatchingAnalyticsLog(userId, grade, reportCompletedAt) {
  if (!userId) return null;
  const query = { userId };
  if (grade) query.grade = grade;

  const logs = await PsychometricAnalyticsLog.find(query)
    .sort({ completedAt: -1 })
    .limit(20)
    .lean();

  if (!logs.length) return null;

  const target = reportCompletedAt ? new Date(reportCompletedAt).getTime() : NaN;
  if (!Number.isFinite(target)) {
    return toAnalyticsLogSummary(logs[0]);
  }

  let best = logs[0];
  let bestDelta = Math.abs(new Date(best.completedAt || best.createdAt).getTime() - target);
  for (const log of logs.slice(1)) {
    const delta = Math.abs(new Date(log.completedAt || log.createdAt).getTime() - target);
    if (delta < bestDelta) {
      best = log;
      bestDelta = delta;
    }
  }
  return toAnalyticsLogSummary(best);
}

function extractIdentityFromAiReport(report) {
  const cover = report?.reportJson?.fullTemplate?.cover || {};
  const firstName = cover.studentFirstName || '';
  const lastName = cover.studentLastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    fullName,
    careerId: cover.careerId || '',
  };
}

function extractIdentityFromManualReport(report) {
  const cover = report?.reportJson?.cover || {};
  return {
    fullName: String(cover.studentName || '').trim(),
    careerId: cover.careerId || '',
  };
}

function extractIdentityFromReport(doc, reportMode) {
  return reportMode === REPORT_MODE_MANUAL
    ? extractIdentityFromManualReport(doc)
    : extractIdentityFromAiReport(doc);
}

function sanitizeDisplayEmail(email) {
  if (!email) return '';
  if (email.toLowerCase().endsWith('@recovered.ilc')) return '';
  return email;
}

function formatDisplayName(name) {
  if (!name || typeof name !== 'string') return name || '';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function completedAtFor(doc) {
  return doc.completedAt || doc.reportGeneratedAt || doc.createdAt;
}

function profileTypeFor(doc, reportMode) {
  const reportJson = doc.reportJson || {};
  if (reportMode === REPORT_MODE_MANUAL) {
    return (
      reportJson.snapshot?.archetypeTitle ||
      reportJson.interests?.signatureLine ||
      reportJson.cover?.reportTitle ||
      ''
    );
  }
  const cover = reportJson.fullTemplate?.cover || {};
  return reportJson.profileType || cover.profileTypeLine || '';
}

function toListItem(doc, userMap, reportMode) {
  const user = userMap[doc.userId?.toString()] || {};
  const identity = extractIdentityFromReport(doc, reportMode);
  return {
    _id: doc._id,
    userId: doc.userId,
    reportMode,
    studentName: formatDisplayName(user.fullName || identity.fullName || 'Unknown'),
    studentEmail: sanitizeDisplayEmail(user.email),
    careerId: user.careerId || identity.careerId || '',
    grade: doc.grade,
    reportShareId: doc.reportShareId || '',
    reportUrl: buildReportUrl(reportMode, doc.grade, doc.reportShareId),
    reportStatus: doc.reportStatus || '',
    profileType: profileTypeFor(doc, reportMode),
    score: doc.score || null,
    attention: doc.attention || null,
    answered: doc.answered,
    total: doc.total,
    constructCount: doc.constructScores?.length || 0,
    completedAt: completedAtFor(doc),
    createdAt: doc.createdAt,
  };
}

function mapManualBatteries(reportJson) {
  const clusters =
    reportJson?.profiles?.clusters ||
    reportJson?.fourProfiles?.clusters ||
    [];
  return clusters.map((cluster) => ({
    tab: cluster.title || cluster.id || 'Profile',
    constructs: (cluster.metrics || []).map((m) => ({
      name: m.name || m.key || '',
      pct: typeof m.percent === 'number' ? m.percent : 0,
      level: m.tier || '',
    })),
  }));
}

function mapManualRecommendations(reportJson) {
  return (reportJson?.recommendations?.cards || []).map((card, index) => ({
    id: card.id || `manual-rec-${index}`,
    title: card.title || '',
    match: card.match || card.matchLabel || '',
    fitScore:
      typeof card.fitScore === 'number'
        ? card.fitScore
        : typeof card.score === 'number'
          ? card.score
          : 0,
    whyAcrossBatteries: card.why || card.whyAcrossBatteries || '',
  }));
}

function mapManualFutureReadiness(reportJson) {
  return (reportJson?.futureReadiness?.pillars || []).map((p) => ({
    name: p.name || p.key || '',
    value: typeof p.percent === 'number' ? `${Math.round(p.percent)}%` : String(p.value || ''),
    level: p.tier || p.level || '',
  }));
}

function toAiReportDetail(doc, user) {
  const reportJson = doc.reportJson || {};
  const fullTemplate = reportJson.fullTemplate || {};

  return {
    _id: doc._id,
    userId: doc.userId,
    reportMode: REPORT_MODE_AI,
    student: user
      ? {
          _id: user._id,
          fullName: formatDisplayName(user.fullName),
          email: sanitizeDisplayEmail(user.email),
          careerId: user.careerId || '',
          profileSegment: user.profileCompletion?.profileSegment || '',
        }
      : (() => {
          const identity = extractIdentityFromAiReport(doc);
          return identity.fullName
            ? {
                _id: doc.userId,
                fullName: formatDisplayName(identity.fullName),
                email: '',
                careerId: identity.careerId,
                profileSegment: '',
              }
            : null;
        })(),
    grade: doc.grade,
    reportShareId: doc.reportShareId || '',
    shareIdTail: doc.shareIdTail || '',
    reportUrl: buildReportUrl(REPORT_MODE_AI, doc.grade, doc.reportShareId),
    reportStatus: doc.reportStatus,
    reportError: doc.reportError || '',
    answered: doc.answered,
    total: doc.total,
    score: doc.score || null,
    attention: doc.attention || null,
    constructScores: doc.constructScores || [],
    reportGeneratedAt: doc.reportGeneratedAt || doc.createdAt,
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

function toManualReportDetail(doc, user) {
  const reportJson = doc.reportJson || {};
  const snapshot = reportJson.snapshot || {};
  const whatsNext = reportJson.whatsNext || {};
  const counsellorBrief = reportJson.counsellorBrief || {};

  const topStrengths = (snapshot.strongestSignals || []).map((signal) => ({
    construct: signal,
    insight: '',
    points: 0,
    weightage: 0,
  }));

  const growthAreas = snapshot.growthArea
    ? [{ construct: 'Growth area', recommendation: snapshot.growthArea, points: 0, weightage: 0 }]
    : [];

  const actionPlan30Days = [
    ...(whatsNext.nutshell || []),
    ...((whatsNext.actions || []).map((a) => (typeof a === 'string' ? a : `${a.title}: ${a.body}`))),
  ].filter(Boolean);

  const counsellorNotes = [
    ...(counsellorBrief.blocks || []).flatMap((block) => [
      block.label ? `${block.label}${block.body ? `: ${block.body}` : ''}` : block.body,
      ...(block.bullets || []),
    ]),
    ...(whatsNext.counsellorBullets || []),
  ].filter(Boolean);

  return {
    _id: doc._id,
    userId: doc.userId,
    reportMode: REPORT_MODE_MANUAL,
    student: user
      ? {
          _id: user._id,
          fullName: formatDisplayName(user.fullName),
          email: sanitizeDisplayEmail(user.email),
          careerId: user.careerId || '',
          profileSegment: user.profileCompletion?.profileSegment || '',
        }
      : (() => {
          const identity = extractIdentityFromManualReport(doc);
          return identity.fullName
            ? {
                _id: doc.userId,
                fullName: formatDisplayName(identity.fullName),
                email: '',
                careerId: identity.careerId,
                profileSegment: '',
              }
            : null;
        })(),
    grade: doc.grade,
    reportShareId: doc.reportShareId || '',
    shareIdTail: doc.shareIdTail || '',
    reportUrl: buildReportUrl(REPORT_MODE_MANUAL, doc.grade, doc.reportShareId),
    reportStatus: doc.reportStatus || 'ready',
    reportError: '',
    answered: doc.answered,
    total: doc.total,
    score: doc.score || null,
    attention: doc.attention || null,
    constructScores: doc.constructScores || [],
    reportGeneratedAt: completedAtFor(doc),
    createdAt: doc.createdAt,
    summary: {
      title: reportJson.cover?.reportTitle || 'Manual Psychometric Report',
      subtitle: snapshot.paragraph1 || reportJson.about?.scoringNote || '',
      profileType: snapshot.archetypeTitle || '',
      dataQualityNote: snapshot.attentionBlock || reportJson.about?.disclaimer || '',
      topStrengths,
      growthAreas,
      streamDirections: [],
      actionPlan30Days,
      counsellorNotes,
    },
    batteries: mapManualBatteries(reportJson),
    recommendations: mapManualRecommendations(reportJson),
    personalisedRecommendations: [],
    workStyle: reportJson.workStyle || null,
    futureReadiness: mapManualFutureReadiness(reportJson),
    snapshot: snapshot || null,
    pathwayReport: null,
    cover: reportJson.cover || null,
    reportJson,
  };
}

function toReportDetail(doc, user, reportMode) {
  return reportMode === REPORT_MODE_MANUAL
    ? toManualReportDetail(doc, user)
    : toAiReportDetail(doc, user);
}

function buildBaseFilter(query) {
  const filter = {};
  if (query.grade) filter.grade = query.grade;
  if (query.reportStatus) filter.reportStatus = query.reportStatus;
  if (query.userId) filter.userId = query.userId;
  return filter;
}

async function buildSearchClauses(search) {
  const users = await PlatformUser.find({
    role: { $exists: false },
    $or: [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { careerId: { $regex: search, $options: 'i' } },
    ],
  })
    .select('_id')
    .lean();
  const userIds = users.map((u) => u._id);

  return {
    ai: [
      { userId: { $in: userIds } },
      { reportShareId: { $regex: search, $options: 'i' } },
      { 'reportJson.profileType': { $regex: search, $options: 'i' } },
      { 'reportJson.fullTemplate.cover.studentFirstName': { $regex: search, $options: 'i' } },
      { 'reportJson.fullTemplate.cover.studentLastName': { $regex: search, $options: 'i' } },
      { 'reportJson.fullTemplate.cover.careerId': { $regex: search, $options: 'i' } },
      { 'reportJson.fullTemplate.cover.profileTypeLine': { $regex: search, $options: 'i' } },
    ],
    manual: [
      { userId: { $in: userIds } },
      { reportShareId: { $regex: search, $options: 'i' } },
      { 'reportJson.cover.studentName': { $regex: search, $options: 'i' } },
      { 'reportJson.cover.careerId': { $regex: search, $options: 'i' } },
      { 'reportJson.snapshot.archetypeTitle': { $regex: search, $options: 'i' } },
      { 'reportJson.cover.reportTitle': { $regex: search, $options: 'i' } },
    ],
  };
}

export async function listPsychometricReports(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const modeFilter = String(req.query.reportMode || '').trim().toLowerCase();
    const includeAi = !modeFilter || modeFilter === REPORT_MODE_AI;
    const includeManual = !modeFilter || modeFilter === REPORT_MODE_MANUAL;

    const baseFilter = buildBaseFilter(req.query);
    const aiFilter = { ...baseFilter };
    const manualFilter = { ...baseFilter };

    if (req.query.search) {
      const clauses = await buildSearchClauses(req.query.search);
      aiFilter.$or = clauses.ai;
      manualFilter.$or = clauses.manual;
    }

    const fetchLimit = skip + limit;

    const tasks = [];
    if (includeAi) {
      tasks.push(
        PsychometricSubmission.find(aiFilter).sort({ createdAt: -1 }).limit(fetchLimit).lean(),
        PsychometricSubmission.countDocuments(aiFilter)
      );
    } else {
      tasks.push(Promise.resolve([]), Promise.resolve(0));
    }
    if (includeManual) {
      tasks.push(
        CdaV2Submission.find(manualFilter).sort({ createdAt: -1 }).limit(fetchLimit).lean(),
        CdaV2Submission.countDocuments(manualFilter)
      );
    } else {
      tasks.push(Promise.resolve([]), Promise.resolve(0));
    }

    const [aiReports, aiTotal, manualReports, manualTotal] = await Promise.all(tasks);

    const merged = [
      ...aiReports.map((doc) => ({ doc, reportMode: REPORT_MODE_AI, sortAt: new Date(doc.createdAt || 0).getTime() })),
      ...manualReports.map((doc) => ({
        doc,
        reportMode: REPORT_MODE_MANUAL,
        sortAt: new Date(doc.createdAt || 0).getTime(),
      })),
    ]
      .sort((a, b) => b.sortAt - a.sortAt)
      .slice(skip, skip + limit);

    const userIds = [
      ...new Set(merged.map((row) => row.doc.userId?.toString()).filter(Boolean)),
    ];
    const users = await PlatformUser.find({ _id: { $in: userIds } })
      .select('fullName email careerId')
      .lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const total = (includeAi ? aiTotal : 0) + (includeManual ? manualTotal : 0);

    return paginated(
      res,
      merged.map((row) => toListItem(row.doc, userMap, row.reportMode)),
      { page, limit, total, pages: Math.ceil(total / limit) || 1 }
    );
  } catch (err) {
    next(err);
  }
}

export async function getPsychometricReport(req, res, next) {
  try {
    let report = await PsychometricSubmission.findById(req.params.id).lean();
    let reportMode = REPORT_MODE_AI;

    if (!report) {
      report = await CdaV2Submission.findById(req.params.id).lean();
      reportMode = REPORT_MODE_MANUAL;
    }

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const user = await PlatformUser.findById(report.userId)
      .select('fullName email careerId profileCompletion.profileSegment')
      .lean();

    const detail = toReportDetail(report, user, reportMode);
    const analyticsLog = await findMatchingAnalyticsLog(
      report.userId,
      report.grade,
      completedAtFor(report)
    );
    detail.analyticsLog = analyticsLog;

    const studentLabel = detail.student?.fullName || 'student';
    logActivity({
      req,
      action: ACTIVITY_ACTIONS.PSYCHOMETRIC_VIEWED,
      description: `Viewed ${reportMode} psychometric report for ${studentLabel}`,
      entityType: 'psychometric',
      entityId: report._id,
      metadata: {
        careerId: detail.student?.careerId || '',
        grade: detail.grade,
        reportMode,
        hasAnalyticsLog: Boolean(analyticsLog),
      },
    });

    return success(res, detail);
  } catch (err) {
    next(err);
  }
}

export async function getPsychometricStats(req, res, next) {
  try {
    const [
      aiTotal,
      aiReady,
      aiPending,
      aiFailed,
      aiByGrade,
      manualTotal,
      manualReady,
      manualByGrade,
    ] = await Promise.all([
      PsychometricSubmission.countDocuments({}),
      PsychometricSubmission.countDocuments({ reportStatus: 'ready' }),
      PsychometricSubmission.countDocuments({ reportStatus: 'pending' }),
      PsychometricSubmission.countDocuments({ reportStatus: 'failed' }),
      PsychometricSubmission.aggregate([
        { $group: { _id: '$grade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      CdaV2Submission.countDocuments({}),
      CdaV2Submission.countDocuments({ reportStatus: 'ready' }),
      CdaV2Submission.aggregate([
        { $group: { _id: '$grade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const gradeMap = new Map();
    for (const row of [...aiByGrade, ...manualByGrade]) {
      const key = row._id || 'unknown';
      gradeMap.set(key, (gradeMap.get(key) || 0) + row.count);
    }

    return success(res, {
      total: aiTotal + manualTotal,
      ready: aiReady + manualReady,
      pending: aiPending,
      failed: aiFailed,
      aiTotal,
      manualTotal,
      byGrade: [...gradeMap.entries()]
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([grade, count]) => ({ grade, count })),
    });
  } catch (err) {
    next(err);
  }
}
