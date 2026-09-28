import { describe, expect, it } from "vitest";
import { loadWorkflow } from "./workflow-contract.ts";

/**
 * 백업 워크플로의 보안 계약만 지킨다. 덤프·검증 절차는 수동 실행이 검증한다.
 */
const { text, workflow, jobs, steps, uses } = loadWorkflow(".github/workflows/backup.yml");
const dumpRun = steps.find((s) => s.run?.includes("pg_dump --dbname"))?.run ?? "";

describe("backup.yml 보안 계약", () => {
  it("워크플로 권한은 contents: read만이다", () => {
    // 스펙 "시크릿": 토큰 권한 최소화
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("모든 잡이 환경 Production을 선언한다", () => {
    for (const job of jobs) {
      // project.md "GitHub Actions": 환경 시크릿은 환경 Production에만 둔다
      expect(job.environment).toBe("Production");
    }
  });

  it("모든 uses는 40자 커밋 SHA로 고정한다", () => {
    expect(uses.length).toBeGreaterThan(0);
    for (const step of uses) {
      // 스펙 "시크릿": Actions는 SHA로 고정
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("아티팩트 보관 기간은 90일이다", () => {
    const upload = steps.find((s) => s.uses?.startsWith("actions/upload-artifact@"));
    // ADR-0008: 아티팩트 보관 기간 최대 90일
    expect(upload?.with?.["retention-days"]).toBe(90);
  });

  it("자격을 로그에 드러내지 않는다", () => {
    // 스펙 "시크릿": 셸 추적(set -x)이나 echo로 마이그레이션 URL을 출력하지 않음
    expect(text).not.toMatch(/set\s+-[a-z]*x/);
    expect(text).not.toMatch(/echo[^\n]*DATABASE_MIGRATION_URL/);
    for (const step of steps) {
      // 스펙 "시크릿": 자격은 env 블록으로만 넘기고 run 문자열에 직접 넣지 않음
      expect(step.run ?? "").not.toContain("secrets.");
    }
  });

  it("pg_dump stderr는 파일로만 받고 마스킹해 출력한다", () => {
    // 스펙 "시크릿": 연결 정보가 담길 수 있는 원본 stderr를 로그에 내지 않음
    expect(dumpRun).toContain("2>work/pg_dump.err");
    expect(dumpRun).not.toContain("cat work/pg_dump.err");
    // 스펙 "시크릿": 실패 원인은 sed로 마스킹한 사본만 출력
    expect(dumpRun).toContain("sed -E");
  });

  it("덤프는 소유자·ACL을 담고 확장은 담지 않는다(no-owner/no-privileges는 복원 몫)", () => {
    const dumpCommand = dumpRun.slice(
      dumpRun.indexOf("pg_dump --dbname"),
      dumpRun.indexOf("--file"),
    );
    // 이슈 #32: 덤프에 --no-owner --no-privileges를 주면 anon·authenticated·service_role ACL이 아카이브에서 영구히 빠진다
    expect(dumpCommand).not.toContain("--no-owner");
    expect(dumpCommand).not.toContain("--no-privileges");
    expect(dumpCommand).toContain("--format=custom");
    expect(dumpCommand).toContain("--schema=public");
    expect(dumpCommand).toContain("--schema=drizzle");
    // 이슈 #32: 확장은 대상 DB마다 소유·스키마가 달라 복원 쪽에서 만든다
    expect(dumpCommand).not.toContain("--extension");
  });
});
