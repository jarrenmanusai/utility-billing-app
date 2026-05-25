import { describe, expect, it } from "vitest";
import {
  checkEmail,
  formatPhPhoneInput,
  isValidEmail,
  isValidPhPhone,
  normalizePhPhone,
} from "../lib/validation";

describe("normalizePhPhone", () => {
  it("accepts +63 with spaces and dashes", () => {
    expect(normalizePhPhone("+63 917 555 1234")).toBe("+639175551234");
    expect(normalizePhPhone("+63-917-555-1234")).toBe("+639175551234");
    expect(normalizePhPhone("+639175551234")).toBe("+639175551234");
  });

  it("accepts the 09 local form", () => {
    expect(normalizePhPhone("0917 555 1234")).toBe("+639175551234");
    expect(normalizePhPhone("09175551234")).toBe("+639175551234");
  });

  it("accepts 63 without the leading +", () => {
    expect(normalizePhPhone("63 917 555 1234")).toBe("+639175551234");
  });

  it("rejects landline prefixes (must start with 9)", () => {
    expect(normalizePhPhone("0817 555 1234")).toBeNull();
    expect(normalizePhPhone("+63 8 555 1234")).toBeNull();
    expect(normalizePhPhone("+63 2 8888 8888")).toBeNull();
  });

  it("rejects too-short and too-long numbers", () => {
    expect(normalizePhPhone("0917 555")).toBeNull();
    expect(normalizePhPhone("+63 917 555 12345")).toBeNull();
  });

  it("rejects non-PH country codes", () => {
    expect(normalizePhPhone("+1 555 123 4567")).toBeNull();
    expect(normalizePhPhone("+44 7700 900123")).toBeNull();
  });

  it("rejects garbage", () => {
    expect(normalizePhPhone("")).toBeNull();
    expect(normalizePhPhone("not a phone")).toBeNull();
    expect(normalizePhPhone("12345")).toBeNull();
  });
});

describe("isValidPhPhone", () => {
  it("matches normalizePhPhone", () => {
    expect(isValidPhPhone("0917 555 1234")).toBe(true);
    expect(isValidPhPhone("+63 917 555 1234")).toBe(true);
    expect(isValidPhPhone("0817 555 1234")).toBe(false);
  });
});

describe("formatPhPhoneInput", () => {
  it("groups +63 numbers as +63 XXX XXX XXXX", () => {
    expect(formatPhPhoneInput("+639175551234")).toBe("+63 917 555 1234");
  });

  it("groups 09 numbers as 09XX XXX XXXX", () => {
    expect(formatPhPhoneInput("09175551234")).toBe("0917 555 1234");
  });

  it("strips invalid characters", () => {
    expect(formatPhPhoneInput("+63abc917-555-1234")).toBe("+63 917 555 1234");
  });
});

describe("checkEmail", () => {
  it("accepts ordinary, well-formed addresses", () => {
    expect(checkEmail("Alice@Example.com").ok).toBe(true);
    expect(checkEmail("alice+tag@sub.example.co.uk").ok).toBe(true);
    expect(checkEmail("juan.dela.cruz@gmail.com").ok).toBe(true);
  });

  it("normalises to lowercase", () => {
    expect(checkEmail("Alice@EXAMPLE.com").normalized).toBe("alice@example.com");
  });

  it("rejects malformed addresses", () => {
    for (const bad of [
      "",
      "no-at-sign",
      "@no-local.com",
      "no-domain@",
      "two@@example.com",
      "spaces in@example.com",
      "trailing.dot.@example.com",
      ".leading@example.com",
      "double..dot@example.com",
      "no-tld@example",
      "short-tld@example.c",
    ]) {
      expect(checkEmail(bad).ok, `expected ${bad} to fail`).toBe(false);
    }
  });

  it("rejects common TLD typos like .con", () => {
    expect(checkEmail("me@gmail.con").ok).toBe(false);
    expect(checkEmail("me@gmail.cim").ok).toBe(false);
  });

  it("rejects disposable email domains", () => {
    expect(checkEmail("user@mailinator.com").ok).toBe(false);
    expect(checkEmail("user@10minutemail.com").ok).toBe(false);
  });

  it("returns a friendly reason string on rejection", () => {
    const r = checkEmail("user@mailinator.com");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/disposable/i);
  });
});

describe("isValidEmail", () => {
  it("matches checkEmail", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("alice@gmail.con")).toBe(false);
  });
});
