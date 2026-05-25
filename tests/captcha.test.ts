import { describe, expect, it } from "vitest";
import { issueChallenge, verifySubmission } from "../lib/captcha";

/**
 * The math question text is randomised, so the test extracts the operands
 * and computes the expected answer the same way a human would.
 */
function solve(question: string): string {
  const m = question.match(/What is (\d+) (.) (\d+)\?/);
  if (!m) throw new Error(`Unrecognised question: ${question}`);
  const a = Number(m[1]!);
  const op = m[2]!;
  const b = Number(m[3]!);
  let result: number;
  if (op === "+") result = a + b;
  else if (op === "-") result = a - b;
  else if (op === "×") result = a * b;
  else throw new Error(`Unknown operator: ${op}`);
  return String(result);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

describe("captcha", () => {
  it("accepts a correctly answered, non-rushed submission", async () => {
    const ch = issueChallenge();
    await sleep(1600); // satisfy the >1.5s human-floor
    const r = verifySubmission({ token: ch.token, answer: solve(ch.question) });
    expect(r.ok).toBe(true);
    expect(r.failureKind).toBe("ok");
  });

  it("rejects when honeypot is filled (bot signature)", () => {
    const ch = issueChallenge();
    const r = verifySubmission({
      token: ch.token,
      answer: solve(ch.question),
      honeypot: "https://spam.example",
    });
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("honeypot");
  });

  it("rejects when submitted too fast (<1.5s)", () => {
    const ch = issueChallenge();
    const r = verifySubmission({ token: ch.token, answer: solve(ch.question) });
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("too_fast");
  });

  it("rejects with wrong answer", async () => {
    const ch = issueChallenge();
    await sleep(1600);
    const r = verifySubmission({ token: ch.token, answer: "999999" });
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("wrong_answer");
  });

  it("rejects forged tokens", async () => {
    await sleep(1600);
    const r = verifySubmission({ token: "fake.signature", answer: "1" });
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("bad_signature");
  });

  it("rejects when token is missing entirely", () => {
    const r = verifySubmission({ token: "", answer: "1" });
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("missing");
  });

  it("each challenge is unique (random nonce)", () => {
    const a = issueChallenge();
    const b = issueChallenge();
    expect(a.token).not.toEqual(b.token);
  });
});
