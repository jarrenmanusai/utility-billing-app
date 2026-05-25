import { describe, it, expect } from "vitest";
import { issueChallenge, verifySubmission } from "../src/utils/captcha.js";

describe("captcha", () => {
  it("issues a challenge with question and token", () => {
    const challenge = issueChallenge();
    expect(challenge.question).toMatch(/What is \d+ [+\-×] \d+\?/);
    expect(challenge.token).toContain(".");
  });

  it("rejects honeypot filled", () => {
    const challenge = issueChallenge();
    const result = verifySubmission({
      token: challenge.token,
      answer: "5",
      honeypot: "bot-filled-this",
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("honeypot");
  });

  it("rejects missing token", () => {
    const result = verifySubmission({
      token: "",
      answer: "5",
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("missing");
  });

  it("rejects bad signature", () => {
    const result = verifySubmission({
      token: "tampered.signature",
      answer: "5",
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("bad_signature");
  });

  it("rejects wrong answer after delay", async () => {
    const challenge = issueChallenge();
    // Simulate waiting 2 seconds
    await new Promise((r) => setTimeout(r, 2000));
    const result = verifySubmission({
      token: challenge.token,
      answer: "99999",
    });
    expect(result.ok).toBe(false);
    expect(result.failureKind).toBe("wrong_answer");
  });

  it("accepts correct answer after delay", async () => {
    const challenge = issueChallenge();
    // Parse the expected answer from the question
    const match = challenge.question.match(/What is (\d+) ([+\-×]) (\d+)\?/);
    if (!match) throw new Error("Could not parse question");
    const a = parseInt(match[1]);
    const op = match[2];
    const b = parseInt(match[3]);
    let answer: number;
    switch (op) {
      case "+": answer = a + b; break;
      case "-": answer = a - b; break;
      case "×": answer = a * b; break;
      default: throw new Error("Unknown op");
    }

    // Wait for minimum fill time
    await new Promise((r) => setTimeout(r, 2000));
    const result = verifySubmission({
      token: challenge.token,
      answer: String(answer),
    });
    expect(result.ok).toBe(true);
    expect(result.failureKind).toBe("ok");
  });
});
