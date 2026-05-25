import { describe, it, expect } from "vitest";
import { parseDueDate, formatDuePreview, toIsoDate } from "../lib/date-parse";

const TODAY = new Date(2026, 4, 23); // May 23, 2026

describe("parseDueDate", () => {
  it("parses MM/DD with current year (future)", () => {
    const r = parseDueDate("05/30", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-30");
    expect(r.yearWasInferred).toBe(true);
  });

  it("parses M/D shorthand", () => {
    const r = parseDueDate("5/30", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-30");
  });

  it("parses M-D with dash separator", () => {
    const r = parseDueDate("5-30", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-30");
  });

  it("rolls inferred year forward if past", () => {
    // April 30 entered on May 23 -> should resolve to April 30, 2027
    const r = parseDueDate("4/30", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2027-04-30");
    expect(r.yearWasInferred).toBe(true);
  });

  it("parses MM/DD/YY with 2-digit year", () => {
    const r = parseDueDate("06/05/26", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-06-05");
    expect(r.yearWasInferred).toBe(false);
  });

  it("parses MM/DD/YYYY with 4-digit year", () => {
    const r = parseDueDate("12/25/2027", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2027-12-25");
  });

  it("rejects explicit past dates (no due date can be in the past)", () => {
    expect(parseDueDate("01/01/2020", TODAY)).toBeNull();
    expect(parseDueDate("6/15/01", TODAY)).toBeNull(); // would be 2001 — reject
    expect(parseDueDate("December 31, 2025", TODAY)).toBeNull(); // before May 23, 2026
    expect(parseDueDate("2025-12-31", TODAY)).toBeNull(); // ISO past — reject
  });

  it("accepts today as the due date (lower bound is inclusive)", () => {
    const r = parseDueDate("2026-05-23", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-23");
  });

  it("parses 'May 30' month-name form", () => {
    const r = parseDueDate("May 30", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-30");
    expect(r.yearWasInferred).toBe(true);
  });

  it("parses 'may 30th' with ordinal suffix", () => {
    const r = parseDueDate("may 30th", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-30");
  });

  it("parses 'May 30, 2026' with explicit year", () => {
    const r = parseDueDate("May 30, 2026", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-05-30");
    expect(r.yearWasInferred).toBe(false);
  });

  it("parses ISO YYYY-MM-DD", () => {
    const r = parseDueDate("2026-06-05", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2026-06-05");
    expect(r.yearWasInferred).toBe(false);
  });

  it("returns null for garbage input", () => {
    expect(parseDueDate("not a date", TODAY)).toBeNull();
    expect(parseDueDate("", TODAY)).toBeNull();
    expect(parseDueDate("13/45", TODAY)).toBeNull(); // invalid month/day
  });

  it("rejects Feb 30 (invalid calendar date)", () => {
    expect(parseDueDate("02/30", TODAY)).toBeNull();
  });

  it("rejects Feb 29 in non-leap year but accepts in leap year", () => {
    // 2026 is not leap
    expect(parseDueDate("02/29/2026", TODAY)).toBeNull();
    // 2028 is leap
    const r = parseDueDate("02/29/2028", TODAY)!;
    expect(toIsoDate(r.date)).toBe("2028-02-29");
  });
});

describe("formatDuePreview", () => {
  it("formats with month name, day, year, and weekday", () => {
    const d = new Date(2026, 4, 30);
    const preview = formatDuePreview(d);
    expect(preview).toMatch(/May 30, 2026/);
    expect(preview).toMatch(/Saturday/);
  });
});

describe("toIsoDate", () => {
  it("formats date as YYYY-MM-DD with zero-padding", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("formatLongDate", () => {
  it("renders as 'May 23, 2026' format", async () => {
    const { formatLongDate } = await import("../lib/date-parse");
    expect(formatLongDate(new Date(2026, 4, 23))).toBe("May 23, 2026");
    expect(formatLongDate(new Date(2026, 0, 5))).toBe("January 5, 2026");
    expect(formatLongDate(new Date(2027, 11, 1))).toBe("December 1, 2027");
  });
});

describe("suggestDates (autofill for vague input)", () => {
  it("returns no suggestions when input is already a valid date", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    expect(suggestDates("05/30", TODAY)).toEqual([]);
    expect(suggestDates("May 30", TODAY)).toEqual([]);
    expect(suggestDates("2026-06-05", TODAY)).toEqual([]);
  });

  it("returns no suggestions for empty / whitespace input", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    expect(suggestDates("", TODAY)).toEqual([]);
    expect(suggestDates("   ", TODAY)).toEqual([]);
  });

  it("suggests dates within a month when user types just a month name", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    const out = suggestDates("June", TODAY);
    expect(out.length).toBeGreaterThan(0);
    // All suggestions render in long format
    expect(out[0].label).toMatch(/^June \d{1,2}, 2026$/);
    // Last suggestion should be the end of the month (June 30)
    expect(out[out.length - 1].iso).toBe("2026-06-30");
  });

  it("suggests dates for partial month name like 'sep'", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    const out = suggestDates("sep", TODAY);
    expect(out.length).toBeGreaterThan(0);
    // Should include a September suggestion
    expect(out.some((s) => s.label.startsWith("September "))).toBe(true);
  });

  it("rolls month-only suggestions to next year if month has passed", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    const lateInYear = new Date(2026, 11, 20); // Dec 20, 2026
    const out = suggestDates("March", lateInYear);
    // All March suggestions should be 2027
    expect(out.every((s) => s.iso.startsWith("2027-03-"))).toBe(true);
  });

  it("suggests same day across upcoming months when user types just a day number", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    const out = suggestDates("30", TODAY);
    expect(out.length).toBeGreaterThan(0);
    // First suggestion is May 30, 2026 (current month)
    expect(out[0].iso).toBe("2026-05-30");
    // Second should be June 30, 2026
    expect(out[1].iso).toBe("2026-06-30");
    // All labels are in long format
    for (const s of out) expect(s.label).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it("skips invalid day-of-month combinations", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    // Day 31 doesn't exist in every month; we should only get valid ones
    const out = suggestDates("31", TODAY);
    for (const s of out) {
      const d = s.date;
      expect(d.getDate()).toBe(31);
    }
  });

  it("never suggests dates in the past for day-only input", async () => {
    const { suggestDates } = await import("../lib/date-parse");
    const out = suggestDates("20", TODAY); // May 20 is past TODAY (May 23)
    // Should skip May 20 and start from June 20 onward
    expect(out[0].iso).toBe("2026-06-20");
  });
});
