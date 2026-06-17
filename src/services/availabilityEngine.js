/**
 * Role-independent availability engine.
 * Generates time slots and can be used by Admin or future Counsellor portals.
 */

export function parseTime(timeStr) {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) {
    const h24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
    throw new Error(`Invalid time format: ${timeStr}`);
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}

export function formatTime24(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function generateSlots(startTime, endTime, slotDuration) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const slots = [];

  for (let current = start; current + slotDuration <= end; current += slotDuration) {
    slots.push({
      startTime: formatTime24(current),
      endTime: formatTime24(current + slotDuration),
      isBooked: false,
    });
  }

  return slots;
}

export function normalizeDate(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDatesInRange(startDate, endDate, frequency, daysOfWeek = []) {
  const dates = [];
  const current = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  while (current <= end) {
    if (frequency === 'daily') {
      dates.push(new Date(current));
    } else if (frequency === 'weekly') {
      if (daysOfWeek.includes(current.getDay())) {
        dates.push(new Date(current));
      }
    } else if (frequency === 'monthly') {
      if (current.getDate() === normalizeDate(startDate).getDate()) {
        dates.push(new Date(current));
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function groupSlotsByDate(availabilities) {
  const grouped = {};

  for (const avail of availabilities) {
    const dateKey = normalizeDate(avail.date).toISOString().split('T')[0];
    if (!grouped[dateKey]) grouped[dateKey] = [];
    const openSlots = avail.slots.filter((s) => !s.isBooked);
    grouped[dateKey].push(
      ...openSlots.map((s) => ({
        slotId: s._id,
        availabilityId: avail._id,
        startTime: s.startTime,
        endTime: s.endTime,
        displayTime: formatTime(parseTime(s.startTime.includes('M') ? s.startTime : formatTime(parseTime(s.startTime)))),
      }))
    );
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => parseTime(a.startTime) - parseTime(b.startTime));
  }

  return grouped;
}
