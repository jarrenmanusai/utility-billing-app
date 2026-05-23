/**
 * Smart date parser for the New Bill due-date field.
 *
 * Accepts a wide range of input formats commonly used in the Philippines and
 * returns a fully-resolved JS Date (or null if unparseable).
 *
 * Rules:
 *   - "05/30" / "5/30" / "5-30"           -> MM/DD with current year
 *   - "May 30" / "may 30" / "May 30th"    -> Month name + day, current year
 *   - "05/30/26" / "5/30/2026"            -> MM/DD/YY or MM/DD/YYYY
 *                                            (2-digit year always assumed 2000s)
 *   - "2026-06-05" / ISO                  -> Parsed as-is
 *   - If the resulting date is in the past (relative to `today`), and the year
 *     was inferred (not explicit), roll forward to next year. This means a
 *     landlord typing "May 30" on June 1st gets May 30, 2027 — the natural
 *     reading of "next May".
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
 * Normalize a 2-digit year to a 4-digit year in the 2000s.
 * "26" -> 2026, "99" -> 2099 (we never go back to the 1900s in this app).
 */
function normalizeYear(yearStr: string): number {
  const n = parseInt(yearStr, 10);
  if (yearStr.length === 2) return 2000 + n;
  if (yearStr.length === 4) return n;
  // 3-digit or weird length — reject
  return NaN;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 0 || month > 11) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
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
    return { date: new Date(year, month, day), yearWasInferred: false };
  }

  // 2) Month name + day (e.g. "May 30", "May 30, 2026", "May 30th")
  const nameMatch = raw.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{2,4}))?$/);
  if (nameMatch) {
    const monthName = nameMatch[1];
    const day = parseInt(nameMatch[2], 10);
    const monthIdx = MONTH_NAMES[monthName];
    if (monthIdx === undefined) return null;
    if (nameMatch[3]) {
      const year = normalizeYear(nameMatch[3]);
      if (!isValidDate(year, monthIdx, day)) return null;
      return { date: new Date(year, monthIdx, day), yearWasInferred: false };
    }
    // No year — use current year, roll forward if past
    const currentYear = today.getFullYear();
    let candidate = new Date(currentYear, monthIdx, day);
    if (!isValidDate(currentYear, monthIdx, day)) return null;
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
      const year = normalizeYear(numMatch[3]);
      if (!isValidDate(year, month, day)) return null;
      return { date: new Date(year, month, day), yearWasInferred: false };
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
 * Heuristics:
 *   - Only a month name (e.g. "May", "Jun"):
 *       -> [1st, 15th, last day] of that month, current year
 *         (rolled forward if the whole month has already passed)
 *   - Only a 1–2 digit number (e.g. "5" or "30"):
 *       -> interpreted as a DAY in the current month (and next 2 months)
 *         if the number is 1..31. So typing "30" gives:
 *           "May 30, 2026", "June 30, 2026", "July 30, 2026"
 *         (skipping months where that day is invalid, e.g. Feb 30)
 *   - Anything that already parses fully via `parseDueDate` returns [].
 *
 * Returns an array of { label, iso, date } — `label` is the user-facing
 * suggestion text (always in "May 23, 2026" format), `iso` is YYYY-MM-DD
 * for storage, `date` is the JS Date.
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
      const startOfMonth = new Date(year, monthIdx, 1);
      // If the entire month has already ended, roll to next year.
      const lastDayCurrentMonth = new Date(year, monthIdx + 1, 0);
      if (lastDayCurrentMonth < startOfDay(today)) {
        year += 1;
      }
      const firstDay = new Date(year, monthIdx, 1);
      const fifteenth = new Date(year, monthIdx, 15);
      const lastDay = new Date(year, monthIdx + 1, 0);
      // Prefer dates that are still in the future for the inferred year.
      const candidates = [firstDay, fifteenth, lastDay].filter(
        (d) => d >= startOfDay(today) || year > today.getFullYear()
      );
      // If we filtered everything out (e.g. user typed current month and we're
      // past the 15th but before month end), include any remaining future dates.
      const finalCandidates = candidates.length > 0 ? candidates : [firstDay, fifteenth, lastDay];
      for (const d of finalCandidates.slice(0, 3)) pushDate(d);
      void startOfMonth; // silence unused
      return out;
    }
  }

  // Case 2: day-only number (1..31)
  const dayOnlyMatch = raw.match(/^(\d{1,2})$/);
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1], 10);
    if (day >= 1 && day <= 31) {
      let cursorMonth = today.getMonth();
      let cursorYear = today.getFullYear();
      // Walk forward up to 6 months to find 3 valid future dates.
      for (let i = 0; i < 6 && out.length < 3; i++) {
        if (isValidDate(cursorYear, cursorMonth, day)) {
          const candidate = new Date(cursorYear, cursorMonth, day);
          if (candidate >= startOfDay(today)) {
            pushDate(candidate);
          }
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
      // Suggest the 15th of each candidate month as a reasonable default.
      pushDate(new Date(year, monthIdx, 15));
    }
  }

  return out;
}
