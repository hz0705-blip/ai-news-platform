import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * PR CI 워크플로의 보안 계약만 지킨다. 잡 구성·명령은 PR 체크 실행 자체가 검증한다.
 */
type Step = { uses?: string; with?: Record<string, unknown> };
type Job = { steps: Step[]; environment?: string };
type Workflow = { permissions: unknown; jobs: Record<string, Job> };

const WORKFLOW_PATH = fileURLToPath(new URL("../../../.github/workflows/ci.yml", import.meta.url));
const text = readFileSync(WORKFLOW_PATH, "utf8");
const workflow = parse(text) as Workflow;
const jobs = Object.values(workflow.jobs);
const uses = jobs.flatMap((job) => job.steps).filter((s) => typeof s.uses === "string");

describe("ci.yml 보안 계약", () => {
  it("워크플로 권한은 contents: read만이다", () => {
    // 스펙 "시크릿": 토큰 권한 최소화
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("모든 uses는 40자 커밋 SHA로 고정한다", () => {
    expect(uses.length).toBeGreaterThan(0);
    for (const step of uses) {
      // 스펙 "시크릿": Actions는 SHA로 고정
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("checkout은 자격을 남기지 않는다(persist-credentials: false)", () => {
    for (const step of uses.filter((s) => s.uses?.startsWith("actions/checkout@"))) {
      // 스펙 "시크릿": 토큰 권한 최소화(체크아웃 뒤 토큰을 디스크에 남기지 않음)
      expect(step.with?.["persist-credentials"]).toBe(false);
    }
  });

  it("시크릿과 환경을 읽지 않는다", () => {
    // project.md "GitHub Actions": 환경 시크릿은 Production 환경 워크플로(backup)만 읽는다
    expect(text).not.toContain("secrets.");
    for (const job of jobs) {
      // project.md "GitHub Actions": PR 체크는 Production 환경을 선언하지 않는다
      expect(job.environment).toBeUndefined();
    }
  });
});
