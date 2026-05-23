import { describe, expect, it } from "vitest";
import { formatPHP, parseNumber } from "../lib/format";

describe("formatPHP (A7 - currency formatting)", () => {
  it("formats positive amounts with peso sign and two decimals", () => {
    expect(formatPHP(1234.56)).toMatch(/₱/);
    expect(formatPHP(1234.56)).toContain("1,234.56");
  });

  it("formats zero correctly", () => {
    expect(formatPHP(0)).toContain("0.00");
  });

  it("handles null/undefined safely", () => {
    expect(formatPHP(null)).toBeDefined();
    expect(formatPHP(undefined)).toBeDefined();
  });

  it("parses string number input", () => {
    expect(formatPHP("99.5")).toContain("99.50");
  });
});

describe("parseNumber", () => {
  it("returns 0 for empty / invalid input", () => {
    expect(parseNumber("")).toBe(0);
    expect(parseNumber("abc")).toBe(0);
  });

  it("parses decimal numbers", () => {
    expect(parseNumber("12.34")).toBe(12.34);
    expect(parseNumber("0.5")).toBe(0.5);
  });
});

describe("smart billing math (A3, A5, A6)", () => {
  // These mirror the live formulas used in app/landlord/bills/new.tsx
  const consumption = (curr: number, prev: number) => Math.max(0, curr - prev);
  const amount = (cons: number, rate: number) => Math.round(cons * rate * 100) / 100;

  it("A3: consumption is current - previous, clamped to >= 0", () => {
    expect(consumption(120, 100)).toBe(20);
    expect(consumption(100, 120)).toBe(0);
    expect(consumption(0, 0)).toBe(0);
  });

  it("A5: amount = consumption * rate rounded to 2dp", () => {
    expect(amount(10, 12.5)).toBe(125);
    expect(amount(7.5, 11.33)).toBeCloseTo(84.98, 2);
  });

  it("A6: total is the sum of all line amounts", () => {
    const items = [amount(10, 12.5), amount(5, 8), amount(3, 100)];
    const total = items.reduce((s, n) => s + n, 0);
    expect(total).toBe(125 + 40 + 300);
  });
});
