import { describe, expect, it } from "vitest";
import { formatBillPeriod } from "../lib/format";

describe("formatBillPeriod", () => {
  it("returns month + year for valid dates", () => {
    const out = formatBillPeriod("2026-05-15T00:00:00Z");
    // Locale en-PH should render the month name and year
    expect(out).toMatch(/2026/);
    expect(out.toLowerCase()).toMatch(/may/);
  });

  it("returns em-dash for nullish input", () => {
    expect(formatBillPeriod(null)).toBe("—");
    expect(formatBillPeriod(undefined)).toBe("—");
    expect(formatBillPeriod("")).toBe("—");
  });

  it("returns em-dash for unparseable input", () => {
    expect(formatBillPeriod("not-a-date")).toBe("—");
  });
});
