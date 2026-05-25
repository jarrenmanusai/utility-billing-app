/**
 * Smart date parser for the New Bill due-date field.
 *
 * Accepts a wide range of input formats commonly used in the Philippines and
 * returns a fully-resolved JS Date (or null if unparseable / in the past).
 *
 * Hard rule (added v1.2.1): the parsed date MUST be today or later. There is
 * no use case in this app for a "past" due date — any year that falls before
 * the current year is treated as a typo, not a valid input. This prevents the
 * "issued May 2026, due June 2001" disaster.
 *
 * Behavior matrix:
 *   - "05/30" / "5/30" / "5-30"           -> MM/DD with current year, rolled
 *                                            to next year if already past
 *   - "May 30" / "may 30" / "May 30th"    -> Month name + day, current year,
 *                                            rolled to next year if past
 *   - "05/30/26" / "5/30/2026"            -> MM/DD/YY or MM/DD/YYYY.
 *                                            2-digit years pick the nearest
 *                                            century that lands in the future
 *                                            (or current). "26" -> 2026,
 *                                            "01" -> rejected (would be 2001
 *                                            or 2101, both nonsensical for
 *                                            the user's intent).
 *   - "2026-06-05" / ISO                  -> Parsed as-is, rejected if past.
 *   - Any explicit year strictly before today's year -> rejected (returns null).
 *
 * Returns `{ date, yearWasInferred }` so the caller can show the user which
 * pieces of information were filled in for them.
 */

export interface ParsedDate {
  date: Date;
  yearWasInferred: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Normalize a 2-digit year using a sliding window:
 *   - If the 2-digit value is within (today.year mod 100) + 5, treat as 2000s.
 *   - Otherwise treat as 1900s (effectively rejecting it as past).
 *
 * Concretely, in 2026:
 *   "26" -> 2026   "27"..."31" -> 2027..2031 (within 5y future)
 *   "30" -> 2030
 *   "99" -> 1999 (rejected as past upstream)
 *   "01" -> 2001 (rejected as past upstream — user clearly mistyped)
 *
 * We DO NOT silently bump "01" to 2101 because that's never what a landlord
 * means when typing a due date. Better to reject and prompt.
 */
function normalizeYear(yearStr: string, today: Date): number {
  const n = parseInt(yearStr, 10);
  if (!Number.isFinite(n)) return NaN;
  if (yearStr.length === 4) return n;
  if (yearStr.length !== 2) return NaN;

  const currentYY = today.getFullYear() % 100;
  const currentCentury = Math.floor(today.getFullYear() / 100) * 100;
  // 2-digit year is treated as 2000s if it's within 5 years past or 50 years future
  // (giving the user generous leeway for typing "26", "27", etc.).
  // Otherwise it goes to the previous century — which will then be rejected as past.
  const sameCenturyDiff = n - currentYY;
  if (sameCenturyDiff >= -5 && sameCenturyDiff <= 50) {
    return currentCentury + n;
  }
  return currentCentury - 100 + n;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 0 || month > 11) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Reject any candidate that falls before today. This is the single
 * checkpoint guaranteeing no past dates ever exit this module.
 */
function ensureFuture(date: Date, today: Date): Date | null {
  return date >= startOfDay(today) ? date : null;
}

export function parseDueDate(
  input: string,
  today: Date = new Date()
): ParsedDate | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  // 1) ISO (YYYY-MM-DD)
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (!isValidDate(year, month, day)) return null;
    const candidate = new Date(year, month, day);
    const safe = ensureFuture(candidate, today);
    if (!safe) return null;
    return { date: safe, yearWasInferred: false };
  }

  // 2) Month name + day (e.g. "May 30", "May 30, 2026", "May 30th")
  const nameMatch = raw.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{2,4}))?$/);
  if (nameMatch) {
    const monthName = nameMatch[1];
    const day = parseInt(nameMatch[2], 10);
    const monthIdx = MONTH_NAMES[monthName];
    if (monthIdx === undefined) return null;
    if (nameMatch[3]) {
      const year = normalizeYear(nameMatch[3], today);
      if (!isValidDate(year, monthIdx, day)) return null;
      const candidate = new Date(year, monthIdx, day);
      const safe = ensureFuture(candidate, today);
      if (!safe) return null;
      return { date: safe, yearWasInferred: false };
    }
    // No year — use current year, roll forward if past
    const currentYear = today.getFullYear();
    if (!isValidDate(currentYear, monthIdx, day)) return null;
    let candidate = new Date(currentYear, monthIdx, day);
    if (candidate < startOfDay(today)) {
      candidate = new Date(currentYear + 1, monthIdx, day);
    }
    return { date: candidate, yearWasInferred: true };
  }

  // 3) Numeric MM/DD or MM/DD/YY[YY] (also accepts -, .)
  const numMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (numMatch) {
    const month = parseInt(numMatch[1], 10) - 1;
    const day = parseInt(numMatch[2], 10);
    if (numMatch[3]) {
      const year = normalizeYear(numMatch[3], today);
      if (!isValidDate(year, month, day)) return null;
      const candidate = new Date(year, month, day);
      const safe = ensureFuture(candidate, today);
      if (!safe) return null;
      return { date: safe, yearWasInferred: false };
    }
    const currentYear = today.getFullYear();
    if (!isValidDate(currentYear, month, day)) return null;
    let candidate = new Date(currentYear, month, day);
    if (candidate < startOfDay(today)) {
      candidate = new Date(currentYear + 1, month, day);
    }
    return { date: candidate, yearWasInferred: true };
  }

  return null;
}

/**
 * Pretty-print a parsed date the way landlords expect:
 *   "May 30, 2026 (Saturday)"
 */
export function formatDuePreview(date: Date): string {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${formatLongDate(date)} (${weekday})`;
}

/**
 * Convert a Date to YYYY-MM-DD for storage / API transmission.
 */
export function toIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Long human-friendly format used everywhere in the UI:
 *   "May 23, 2026"
 *
 * This is the SINGLE source of truth for date display. Never show ISO,
 * MM/DD/YYYY, or any other format to the user.
 */
export function formatLongDate(date: Date): string {
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Build up to 3 autofill suggestions for a vague typed input.
 *
 * All suggestions are guaranteed to be today-or-later — the picker should
 * never offer a past date for a bill that hasn't been issued yet.
 */
export interface DateSuggestion {
  label: string;
  iso: string;
  date: Date;
}

export function suggestDates(input: string, today: Date = new Date()): DateSuggestion[] {
  const raw = input.trim().toLowerCase();
  if (!raw) return [];

  // If the input already parses cleanly, no suggestions needed.
  if (parseDueDate(raw, today)) return [];

  const out: DateSuggestion[] = [];
  const seen = new Set<string>();
  const pushDate = (d: Date) => {
    if (d < startOfDay(today)) return; // hard guarantee: no past dates
    const iso = toIsoDate(d);
    if (seen.has(iso)) return;
    seen.add(iso);
    out.push({ label: formatLongDate(d), iso, date: d });
  };

  // Case 1: month-name only (or month-name plus partial junk)
  const monthOnlyMatch = raw.match(/^([a-z]+)\.?$/);
  if (monthOnlyMatch) {
    const monthIdx = MONTH_NAMES[monthOnlyMatch[1]];
    if (monthIdx !== undefined) {
      let year = today.getFullYear();
      const lastDayCurrentMonth = new Date(year, monthIdx + 1, 0);
      if (lastDayCurrentMonth < startOfDay(today)) {
        year += 1;
      }
      const candidates = [
        new Date(year, monthIdx, 1),
        new Date(year, monthIdx, 15),
        new Date(year, monthIdx + 1, 0), // last day
      ];
      for (const d of candidates) pushDate(d);
      // If everything in the current year was already past, advance one more year
      // (defensive — `lastDayCurrentMonth` already handles this, but explicit).
      if (out.length === 0) {
        const nextYear = year + 1;
        pushDate(new Date(nextYear, monthIdx, 1));
        pushDate(new Date(nextYear, monthIdx, 15));
        pushDate(new Date(nextYear, monthIdx + 1, 0));
      }
      return out.slice(0, 3);
    }
  }

  // Case 2: day-only number (1..31)
  const dayOnlyMatch = raw.match(/^(\d{1,2})$/);
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1], 10);
    if (day >= 1 && day <= 31) {
      let cursorMonth = today.getMonth();
      let cursorYear = today.getFullYear();
      for (let i = 0; i < 6 && out.length < 3; i++) {
        if (isValidDate(cursorYear, cursorMonth, day)) {
          const candidate = new Date(cursorYear, cursorMonth, day);
          pushDate(candidate); // pushDate already filters past
        }
        cursorMonth += 1;
        if (cursorMonth > 11) {
          cursorMonth = 0;
          cursorYear += 1;
        }
      }
      return out;
    }
  }

  // Case 3: partial month name (e.g. "ma", "sep")
  const partialMonthMatch = raw.match(/^([a-z]{2,})/);
  if (partialMonthMatch) {
    const prefix = partialMonthMatch[1];
    const matchedMonths = Object.entries(MONTH_NAMES)
      .filter(([name]) => name.startsWith(prefix) && name.length >= 3)
      .map(([, idx]) => idx);
    const uniqueMonths = Array.from(new Set(matchedMonths)).slice(0, 3);
    for (const monthIdx of uniqueMonths) {
      let year = today.getFullYear();
      const lastDayCurrentMonth = new Date(year, monthIdx + 1, 0);
      if (lastDayCurrentMonth < startOfDay(today)) year += 1;
      pushDate(new Date(year, monthIdx, 15));
    }
  }

  return out;
}
