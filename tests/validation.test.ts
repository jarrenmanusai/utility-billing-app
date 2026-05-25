import { describe, it, expect } from "vitest";
import { normalizePhPhone, checkEmail } from "../src/utils/validation.js";

describe("normalizePhPhone", () => {
  it("normalizes +63 format", () => {
    expect(normalizePhPhone("+63 917 555 1234")).toBe("+639175551234");
  });

  it("normalizes 09XX format", () => {
    expect(normalizePhPhone("0917 555 1234")).toBe("+639175551234");
  });

  it("normalizes 63 without + format", () => {
    expect(normalizePhPhone("63 9175551234")).toBe("+639175551234");
  });

  it("rejects landline prefix", () => {
    expect(normalizePhPhone("0817 555 1234")).toBeNull();
  });

  it("rejects too short", () => {
    expect(normalizePhPhone("0917555123")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(normalizePhPhone("")).toBeNull();
  });

  it("handles dashes and parens", () => {
    expect(normalizePhPhone("+63-917-555-1234")).toBe("+639175551234");
  });
});

describe("checkEmail", () => {
  it("accepts valid email", () => {
    const result = checkEmail("user@example.com");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("user@example.com");
  });

  it("normalizes to lowercase", () => {
    const result = checkEmail("User@Example.COM");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("user@example.com");
  });

  it("rejects empty", () => {
    const result = checkEmail("");
    expect(result.ok).toBe(false);
  });

  it("rejects spaces", () => {
    const result = checkEmail("user @example.com");
    expect(result.ok).toBe(false);
  });

  it("rejects disposable domain", () => {
    const result = checkEmail("test@mailinator.com");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Disposable");
  });

  it("rejects TLD typo .con", () => {
    const result = checkEmail("user@gmail.con");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(".con");
  });

  it("rejects consecutive dots", () => {
    const result = checkEmail("user..name@example.com");
    expect(result.ok).toBe(false);
  });
});
