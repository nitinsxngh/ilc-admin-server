import Counsellor from '../models/Counsellor.js';
import Booking from '../models/Booking.js';
import { success } from '../utils/apiResponse.js';
import { normalizeDate } from '../services/availabilityEngine.js';

export async function getDashboardStats(req, res, next) {
  try {
    const today = normalizeDate(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalCounsellors,
      activeCounsellors,
      todaysSessions,
      upcomingSessions,
      completedSessions,
      revenueResult,
    ] = await Promise.all([
      Counsellor.countDocuments({ deletedAt: null }),
      Counsellor.countDocuments({ status: 'active', deletedAt: null }),
      Booking.countDocuments({
        bookingDate: { $gte: today, $lt: tomorrow },
        status: { $in: ['confirmed', 'pending', 'rescheduled'] },
      }),
      Booking.countDocuments({
        bookingDate: { $gte: today },
        status: { $in: ['confirmed', 'pending', 'rescheduled'] },
      }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.aggregate([
        { $match: { status: { $in: ['confirmed', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$sessionFee' } } },
      ]),
    ]);

    return success(res, {
      totalCounsellors,
      activeCounsellors,
      todaysSessions,
      upcomingSessions,
      completedSessions,
      revenue: revenueResult[0]?.total || 0,
    });
  } catch (err) {
    next(err);
  }
}
