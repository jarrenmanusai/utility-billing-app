/**
 * scripts/verify-tests.ts
 *
 * Compares the current vitest run against tests/SNAPSHOT.txt and exits
 * non-zero if they disagree. Catches accidental test deletions or
 * silently-skipped suites that would otherwise pass CI.
 *
 * Wire-up:
 *   - pnpm verify:tests   →  this script
 *   - pnpm verify:deploy  →  invokes pnpm verify:tests as one of its passes
 *
 * Failure modes (all exit 1):
 *   - SNAPSHOT.txt missing or malformed
 *   - vitest reports a test count != snapshot count
 *   - vitest reports any failing test
 *   - file count drift (count of tests/*.test.ts != snapshot)
 *
 * Soft warnings (do NOT fail):
 *   - File list drift (tests added/removed but counts still match) →
 *     prints a diff and tells the operator to refresh SNAPSHOT.txt.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const SNAP_PATH = resolve(process.cwd(), "tests/SNAPSHOT.txt");

function fail(msg: string): never {
  console.error(`[verify-tests] FAIL: ${msg}`);
  process.exit(1);
}

function parseSnapshot(): { tests: number; files: number; fileList: string[] } {
  if (!existsSync(SNAP_PATH)) {
    fail(`tests/SNAPSHOT.txt missing. Create it (see file header for format).`);
  }
  const lines = readFileSync(SNAP_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const tests = Number(lines[0]);
  const files = Number(lines[1]);
  if (!Number.isFinite(tests) || tests <= 0) {
    fail(`SNAPSHOT.txt: first non-comment line must be a positive integer (test count).`);
  }
  if (!Number.isFinite(files) || files <= 0) {
    fail(`SNAPSHOT.txt: second non-comment line must be a positive integer (file count).`);
  }
  return { tests, files, fileList: lines.slice(2).sort() };
}

function runVitest(): { tests: number; files: number; failed: number } {
  let raw: string;
  try {
    // --reporter=basic is concise; --no-color avoids ANSI in pipes.
    raw = execSync("./node_modules/.bin/vitest run --reporter=basic --no-color", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e: any) {
    raw = (e.stdout ?? "") + (e.stderr ?? "");
  }
  // Match lines like:
  //   Test Files  9 passed (9)
  //        Tests  79 passed (79)
  //        Tests  78 passed | 1 failed (79)
  const fileLine = raw.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
  const testLine = raw.match(/Tests\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?\s+\((\d+)\)/);
  if (!fileLine || !testLine) {
    console.error(raw.split("\n").slice(-25).join("\n"));
    fail(`could not parse vitest summary. Run \`pnpm test\` to see the raw output.`);
  }
  const filesPassed = Number(fileLine[1]);
  const testsPassed = Number(testLine[1]);
  const testsFailed = testLine[2] ? Number(testLine[2]) : 0;
  return { tests: testsPassed, files: filesPassed, failed: testsFailed };
}

function listCurrentTestFiles(): string[] {
  // Cheap: glob via shell to avoid pulling in another dep.
  const raw = execSync(
    "find tests -type f -name '*.test.ts' | sort",
    { encoding: "utf8" }
  );
  return raw.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

function main() {
  console.log("[verify-tests] reading tests/SNAPSHOT.txt …");
  const snap = parseSnapshot();
  console.log(`[verify-tests] snapshot expects ${snap.tests} tests across ${snap.files} files`);

  console.log("[verify-tests] running vitest …");
  const run = runVitest();
  console.log(`[verify-tests] vitest reports ${run.tests} passed, ${run.failed} failed across ${run.files} files`);

  if (run.failed > 0) {
    fail(`${run.failed} test(s) failing. Fix tests before deploy.`);
  }
  if (run.tests !== snap.tests) {
    fail(
      `test count drift: snapshot=${snap.tests}, runtime=${run.tests}. ` +
        `If this drift is intentional (you added/removed tests), update tests/SNAPSHOT.txt.`
    );
  }
  if (run.files !== snap.files) {
    fail(
      `test file count drift: snapshot=${snap.files}, runtime=${run.files}. ` +
        `Update tests/SNAPSHOT.txt to match.`
    );
  }

  // Soft warning: file list drift
  const current = listCurrentTestFiles();
  const onlyInRun = current.filter((f) => !snap.fileList.includes(f));
  const onlyInSnap = snap.fileList.filter((f) => !current.includes(f));
  if (onlyInRun.length > 0 || onlyInSnap.length > 0) {
    console.warn("[verify-tests] WARN: file list drift (counts match, names differ)");
    onlyInRun.forEach((f) => console.warn(`  + ${f} (in repo, not in SNAPSHOT.txt)`));
    onlyInSnap.forEach((f) => console.warn(`  - ${f} (in SNAPSHOT.txt, not in repo)`));
    console.warn("  Update tests/SNAPSHOT.txt's file list to match the current repo state.");
  }

  console.log("[verify-tests] OK");
}

main();
