import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "cycle-finish");
let fakeDir = "";

// 가짜 gh: 체크 이름 조회(--json name) 횟수를 파일에 세고, 처음 vercelOnly번은 Vercel만 돌려준다.
function writeFakeGh(vercelOnly: number) {
  fakeDir = mkdtempSync(join(tmpdir(), "cycle-finish-"));
  const count = join(fakeDir, "count");
  writeFileSync(count, "0");
  writeFileSync(
    join(fakeDir, "gh"),
    `#!/usr/bin/env bash
args="$*"
n="$(cat "${count}")"
case "$args" in
  "pr view"*) echo ticket/1-test ;;
  *"--watch"*) exit 0 ;;
  *"--json name,bucket"*) echo 0 ;;
  *"--json name"*)
    n=$((n + 1)); echo "$n" > "${count}"
    echo Vercel
    [ "$n" -gt ${vercelOnly} ] && printf 'checks\\ne2e (chromium)\\nmigration-smoke\\n'
    exit 0 ;;
  "pr checks"*) echo listed ;;
esac
`,
  );
  chmodSync(join(fakeDir, "gh"), 0o755);
  const result = spawnSync("bash", [script, "1", "--wait-only"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeDir}:${process.env.PATH}`,
      CYCLE_FINISH_POLL_SECONDS: "0",
      CYCLE_FINISH_POLL_TRIES: "3",
    },
  });
  return { result, calls: Number(readFileSync(count, "utf8").trim()) };
}

afterEach(() => {
  if (fakeDir) rmSync(fakeDir, { recursive: true, force: true });
});

describe("cycle-finish --wait-only", () => {
  it("Vercel 체크만 등록된 동안은 판정하지 않고 checks가 나타난 뒤 모두 pass면 PASS", () => {
    const { result, calls } = writeFakeGh(2);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(calls).toBe(3);
  });

  it("대기 한도 안에 checks가 안 나타나면 FAIL", () => {
    const { result, calls } = writeFakeGh(99);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("FAIL");
    expect(result.stdout).not.toContain("PASS");
    expect(calls).toBe(3);
  });
});
