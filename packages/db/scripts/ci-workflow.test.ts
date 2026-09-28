import { describe, expect, it } from "vitest";
import { loadWorkflow } from "./workflow-contract.ts";

/**
 * PR CI 워크플로의 보안 계약과 PostgreSQL 메이저 정합만 지킨다. 잡 구성·명령은 PR 체크 실행 자체가 검증한다.
 */
const { text, workflow, jobs, uses } = loadWorkflow(".github/workflows/ci.yml");

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

  it("고정한 SHA마다 버전 주석(# vN.N.N)을 단다", () => {
    const pinned = text.split("\n").filter((line) => /uses: \S+@[0-9a-f]{40}/.test(line));
    expect(pinned.length).toBe(uses.length);
    for (const line of pinned) {
      // 사람이 고정 버전을 읽고 갱신할 수 있게 SHA 옆에 태그를 둔다
      expect(line).toMatch(/@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
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

  it("실 DB 테스트 URL은 서비스 컨테이너(localhost)만 가리킨다", () => {
    // 이슈 #42: 실 DB 테스트는 DATABASE_TEST_URL로만 붙고, 그 URL은 프로덕션이 아니라 잡의 일회용 컨테이너다
    const urls = jobs.flatMap((job) =>
      job.env?.DATABASE_TEST_URL ? [job.env.DATABASE_TEST_URL] : [],
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^postgresql:\/\/[^@]+@localhost:5432\//);
  });
});

describe("ci.yml PostgreSQL 메이저·트리거", () => {
  it("서비스 이미지 태그의 -pg<N>이 PG_MAJOR와 같다", () => {
    const images = jobs.flatMap((job) => Object.values(job.services ?? {}).map((svc) => svc.image));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      // 스펙 "배포와 운영": CI DB는 프로덕션과 같은 Postgres 메이저. 이미지 태그는 env를 보간할 수 없어 여기서 묶는다
      expect(image).toMatch(new RegExp(`-pg${workflow.env?.PG_MAJOR}@sha256:[0-9a-f]{64}$`));
    }
  });

  it("스쿼시 머지 뒤 main push에서도 돈다", () => {
    // 이슈 #36: PR 밖으로 들어간 main 커밋도 검사한다
    expect(workflow.on.push).toEqual({ branches: ["main"] });
    expect(workflow.on).toHaveProperty("pull_request");
  });
});
