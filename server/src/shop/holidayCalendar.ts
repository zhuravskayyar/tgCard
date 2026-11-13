/** A yearly holiday span in UTC calendar days; the end day is inclusive and may fall in the next year. */
export interface HolidaySpan {
  endDay: number;
  endMonth: number;
  startDay: number;
  startMonth: number;
}

export interface HolidayWindow {
  /** Exclusive: midnight UTC after the last holiday day. */
  endsAt: Date;
  startsAt: Date;
}

const DAY_MS = 86_400_000;

function windowStartingIn(span: HolidaySpan, year: number): HolidayWindow {
  const startsAt = new Date(Date.UTC(year, span.startMonth - 1, span.startDay));
  const wraps = span.endMonth < span.startMonth || (span.endMonth === span.startMonth && span.endDay < span.startDay);
  const lastDay = new Date(Date.UTC(year + (wraps ? 1 : 0), span.endMonth - 1, span.endDay));
  return { startsAt, endsAt: new Date(lastDay.getTime() + DAY_MS) };
}

/** The occurrence that contains `now`, or null outside the holiday. */
export function findActiveHolidayWindow(span: HolidaySpan, now: Date): HolidayWindow | null {
  const year = now.getUTCFullYear();
  for (const candidateYear of [year - 1, year]) {
    const window = windowStartingIn(span, candidateYear);
    if (window.startsAt <= now && now < window.endsAt) return window;
  }
  return null;
}

/** The next occurrence that starts after `now`. */
export function findNextHolidayWindow(span: HolidaySpan, now: Date): HolidayWindow {
  const year = now.getUTCFullYear();
  const thisYear = windowStartingIn(span, year);
  return thisYear.startsAt > now ? thisYear : windowStartingIn(span, year + 1);
}

/** The DATE key that groups a player's purchases within one occurrence. */
export function holidayWindowKey(window: HolidayWindow) {
  return window.startsAt.toISOString().slice(0, 10);
}
