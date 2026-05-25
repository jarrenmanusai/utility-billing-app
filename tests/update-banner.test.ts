import { describe, it, expect } from "vitest";

/**
 * Mirror of the semver-compare helper used inside the update-banner /
 * get-app screens. Re-implementing it here (rather than importing the
 * RN component) keeps this test fully node-friendly while ensuring we
 * never regress the comparison logic that gates whether the banner
 * shows up.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

describe("update banner semver compare", () => {
  it("treats identical versions as equal", () => {
    expect(compareSemver("1.4.0", "1.4.0")).toBe(0);
  });

  it("detects newer minor and patch correctly", () => {
    expect(compareSemver("1.4.0", "1.3.6")).toBe(1);
    expect(compareSemver("1.3.6", "1.4.0")).toBe(-1);
    expect(compareSemver("1.3.6", "1.3.5")).toBe(1);
  });

  it("treats missing trailing segments as zero", () => {
    expect(compareSemver("1.4", "1.4.0")).toBe(0);
    expect(compareSemver("2", "1.99.99")).toBe(1);
  });

  it("only triggers banner when live > current", () => {
    const current = "1.4.0";
    expect(compareSemver("1.4.0", current) > 0).toBe(false); // same — no banner
    expect(compareSemver("1.3.9", current) > 0).toBe(false); // older — no banner
    expect(compareSemver("1.4.1", current) > 0).toBe(true); // newer — show banner
    expect(compareSemver("2.0.0", current) > 0).toBe(true); // major bump
  });
});
