import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * 워크플로 파일의 계약을 지킨다(스펙 "시크릿": SHA 고정·최소 권한, ADR-0008: 보관 90일, project.md: 환경 Production).
 * 실제 덤프·검증은 수동 실행이 테스트다(이슈 #18 인수 조건).
 */
const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../.github/workflows/backup.yml", import.meta.url),
);
const text = readFileSync(WORKFLOW_PATH, "utf8");
// biome-ignore lint/suspicious/noExplicitAny: 외부 YAML 구조를 그대로 검사한다
const workflow = parse(text) as any;
// biome-ignore lint/suspicious/noExplicitAny: 외부 YAML 구조를 그대로 검사한다
const jobs = workflow.jobs as Record<string, any>;

// biome-ignore lint/suspicious/noExplicitAny: 외부 YAML 구조를 그대로 검사한다
function steps(job: string): any[] {
  // biome-ignore lint/suspicious/noExplicitAny: 외부 YAML 구조를 그대로 검사한다
  return jobs[job].steps as any[];
}

describe("backup.yml 트리거", () => {
  it("야간 스케줄(UTC 18:30 = KST 03:30)·수동 실행·다른 워크플로 호출을 받는다", () => {
    expect(workflow.on.schedule).toEqual([{ cron: "30 18 * * *" }]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on).toHaveProperty("workflow_call");
  });
});

describe("backup.yml 권한·환경", () => {
  it("워크플로 권한은 contents: read만이다", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("dump·verify 두 잡이 있고 verify는 dump 뒤에 돈다", () => {
    expect(Object.keys(jobs).sort()).toEqual(["dump", "verify"]);
    expect(jobs.verify.needs).toBe("dump");
  });

  it("두 잡 모두 환경 Production을 선언한다(환경 시크릿만 읽힌다)", () => {
    expect(jobs.dump.environment).toBe("Production");
    expect(jobs.verify.environment).toBe("Production");
  });

  it("두 잡 모두 ubuntu-24.04에서 돈다", () => {
    expect(jobs.dump["runs-on"]).toBe("ubuntu-24.04");
    expect(jobs.verify["runs-on"]).toBe("ubuntu-24.04");
  });

  it("dump 잡은 동시 실행을 하나로 제한한다", () => {
    expect(workflow.concurrency).toEqual({ group: "db-backup", "cancel-in-progress": false });
  });
});

describe("backup.yml 액션 고정", () => {
  const uses = [...steps("dump"), ...steps("verify")]
    .map((step) => step.uses as string | undefined)
    .filter((value): value is string => value !== undefined);

  it("uses가 있는 스텝이 넷 이상이다", () => {
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  it("모든 uses는 40자 SHA로 고정된다", () => {
    for (const value of uses) {
      expect(value).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  it("SHA 옆에 버전 주석(# vN.N.N)이 있다", () => {
    for (const value of uses) {
      const sha = value.split("@")[1];
      expect(text).toMatch(new RegExp(`${sha}\\s+#\\s*v\\d+\\.\\d+\\.\\d+`));
    }
  });
});

describe("backup.yml 아티팩트", () => {
  const upload = steps("dump").find((s) => String(s.uses).startsWith("actions/upload-artifact@"));
  it("보관 기간 90일, 이름 db-backup-<UTC>-<run_id>, 압축 없음(pg_dump custom이 이미 압축)", () => {
    expect(upload.with["retention-days"]).toBe(90);
    expect(upload.with.name).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions 표현식 `${{ }}`을 문자 그대로 검사한다
      "db-backup-${{ steps.stamp.outputs.stamp }}-${{ github.run_id }}",
    );
    expect(upload.with["compression-level"]).toBe(0);
    expect(upload.with["if-no-files-found"]).toBe("error");
  });

  it("verify는 같은 이름의 아티팩트를 내려받는다", () => {
    const download = steps("verify").find((s) =>
      String(s.uses).startsWith("actions/download-artifact@"),
    );
    expect(download.with.name).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions 표현식 `${{ }}`을 문자 그대로 검사한다
      "db-backup-${{ needs.dump.outputs.stamp }}-${{ github.run_id }}",
    );
  });
});

describe("backup.yml 시크릿·로그 위생", () => {
  it("set -x·echo $DATABASE_MIGRATION_URL이 없다", () => {
    expect(text).not.toMatch(/set\s+-[a-z]*x/);
    expect(text).not.toMatch(/echo[^\n]*DATABASE_MIGRATION_URL/);
  });

  it("자격은 env 블록으로만 넘긴다(secrets를 run 문자열에 직접 넣지 않음)", () => {
    for (const step of [...steps("dump"), ...steps("verify")]) {
      if (typeof step.run === "string") {
        expect(step.run).not.toContain("secrets.");
      }
    }
  });

  it("pg_dump는 custom 형식, --no-owner --no-privileges, public·drizzle 스키마다", () => {
    const dumpStep = steps("dump").find(
      (s) => typeof s.run === "string" && s.run.includes("pg_dump --dbname"),
    );
    expect(dumpStep.run).toContain("--format=custom");
    expect(dumpStep.run).toContain("--no-owner");
    expect(dumpStep.run).toContain("--no-privileges");
    expect(dumpStep.run).toContain("--schema=public");
    expect(dumpStep.run).toContain("--schema=drizzle");
  });

  it("verify는 sha256sum -c, backup-decrypt.ts, pg_restore --list를 모두 실행한다", () => {
    const runs = steps("verify")
      .map((s) => String(s.run ?? ""))
      .join("\n");
    expect(runs).toContain("sha256sum -c");
    expect(runs).toContain("packages/db/scripts/backup-decrypt.ts");
    expect(runs).toContain("pg_restore --list");
  });

  it("pg_dump 실패 시 stderr를 파일로만 받고 원본을 로그에 cat하지 않는다", () => {
    const dumpStep = steps("dump").find(
      (s) => typeof s.run === "string" && s.run.includes("pg_dump --dbname"),
    );
    expect(dumpStep.run).toContain("2>work/pg_dump.err");
    expect(dumpStep.run).not.toContain("cat work/pg_dump.err");
  });

  it("verify는 TOC가 비었거나 마이그레이션 저널이 없으면 실패한다", () => {
    const runs = steps("verify")
      .map((s) => String(s.run ?? ""))
      .join("\n");
    expect(runs).toContain("__drizzle_migrations");
    expect(runs).toContain("-lt 1");
  });
});

describe("PostgreSQL 17 클라이언트 경로", () => {
  it("dump·verify 두 설치 스텝 모두 PGDG 17 bin을 GITHUB_PATH에 추가한다", () => {
    const installSteps = [...steps("dump"), ...steps("verify")].filter(
      (s) => typeof s.name === "string" && s.name.includes("PostgreSQL 17 클라이언트 설치"),
    );
    expect(installSteps.length).toBe(2);
    for (const step of installSteps) {
      expect(step.run).toContain('>> "$GITHUB_PATH"');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: 셸 변수 ${PG_MAJOR}를 문자 그대로 검사한다
      expect(step.run).toContain("/usr/lib/postgresql/${PG_MAJOR}/bin");
    }
  });

  it("pg_dump 스텝은 실행 전 메이저 버전을 확인한다", () => {
    const dumpStep = steps("dump").find(
      (s) => typeof s.run === "string" && s.run.includes("pg_dump --dbname"),
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 셸 변수 ${PG_MAJOR}를 문자 그대로 검사한다
    expect(dumpStep.run).toContain('grep -q "(PostgreSQL) ${PG_MAJOR}\\.');
  });

  it("verify 잡은 pg_restore --version도 실행한다", () => {
    const runs = steps("verify")
      .map((s) => String(s.run ?? ""))
      .join("\n");
    expect(runs).toContain("pg_restore --version");
  });

  it("pg_dump 실패 시 마스킹된 stderr를 출력하고 원본은 여전히 cat하지 않는다", () => {
    const dumpStep = steps("dump").find(
      (s) => typeof s.run === "string" && s.run.includes("pg_dump --dbname"),
    );
    expect(dumpStep.run).toContain("sed -E");
    expect(dumpStep.run).not.toContain("cat work/pg_dump.err");
  });
});
