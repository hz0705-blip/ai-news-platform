import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * PR CI 워크플로의 계약을 지킨다(이슈 #19, 스펙 "배포와 운영" 배포 흐름·"골든셋과 평가" CI 결정론 검사만).
 * 실제 실행은 PR 체크가 테스트다(이슈 #19 인수 조건).
 */
const WORKFLOW_PATH = fileURLToPath(new URL("../../../.github/workflows/ci.yml", import.meta.url));
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

function runs(job: string): string {
  return steps(job)
    .map((s) => String(s.run ?? ""))
    .join("\n");
}

describe("ci.yml 트리거·권한", () => {
  it("모든 PR과 수동 실행에서 돈다", () => {
    expect(workflow.on).toHaveProperty("pull_request");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on).not.toHaveProperty("schedule");
  });

  it("워크플로 권한은 contents: read만이다", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("같은 PR의 이전 실행은 취소한다", () => {
    expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
  });

  it("checks·e2e·migration-smoke 잡이 있고 서로 의존하지 않는다(병렬)", () => {
    expect(Object.keys(jobs).sort()).toEqual(["checks", "e2e", "migration-smoke"]);
    expect(jobs.e2e.needs).toBeUndefined();
    expect(jobs.checks.needs).toBeUndefined();
    expect(jobs["migration-smoke"].needs).toBeUndefined();
  });

  it("모든 잡이 ubuntu-24.04에서 돌고 시간 제한이 있다", () => {
    for (const job of Object.values(jobs)) {
      expect(job["runs-on"]).toBe("ubuntu-24.04");
      expect(typeof job["timeout-minutes"]).toBe("number");
    }
  });
});

describe("ci.yml 프로덕션 E2E", () => {
  it("고정 설치·브라우저 설치·프로덕션 빌드 이후 Playwright를 실행한다", () => {
    const r = runs("e2e");
    expect(r).toContain("pnpm install --frozen-lockfile");
    expect(r).toContain("playwright install --with-deps chromium firefox webkit");
    expect(r.indexOf("@newsplatform/web build")).toBeLessThan(
      r.indexOf("@newsplatform/web test:e2e"),
    );
    expect(r).toContain("pnpm --filter @newsplatform/web test:e2e");
    expect(r).not.toContain("next dev");
  });
});

describe("ci.yml 고정", () => {
  it("모든 uses는 40자 커밋 SHA로 고정한다", () => {
    const uses = Object.keys(jobs)
      .flatMap((job) => steps(job))
      .map((s) => s.uses)
      .filter((u): u is string => typeof u === "string");
    expect(uses.length).toBeGreaterThanOrEqual(6);
    for (const u of uses) {
      expect(u).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("checkout은 자격을 남기지 않는다(persist-credentials: false)", () => {
    for (const job of Object.keys(jobs)) {
      const checkout = steps(job).find(
        (s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"),
      );
      expect(checkout.with["persist-credentials"]).toBe(false);
    }
  });

  it("pnpm은 packageManager를 읽고(버전 미지정) Node 24 + pnpm 스토어 캐시를 쓴다", () => {
    for (const job of Object.keys(jobs)) {
      const pnpm = steps(job).find(
        (s) => typeof s.uses === "string" && s.uses.startsWith("pnpm/action-setup@"),
      );
      expect(pnpm).toBeDefined();
      expect(pnpm.with?.version).toBeUndefined();
      const node = steps(job).find(
        (s) => typeof s.uses === "string" && s.uses.startsWith("actions/setup-node@"),
      );
      expect(node.with["node-version"]).toBe("24");
      expect(node.with.cache).toBe("pnpm");
      // setup-node의 cache: pnpm은 pnpm이 먼저 있어야 한다
      expect(steps(job).indexOf(pnpm)).toBeLessThan(steps(job).indexOf(node));
    }
  });

  it("시크릿을 전혀 읽지 않는다(secrets. 없음, environment 없음)", () => {
    expect(text).not.toContain("secrets.");
    for (const job of Object.values(jobs)) {
      expect(job.environment).toBeUndefined();
    }
  });
});

describe("ci.yml checks 잡", () => {
  it("고정 설치 → 린트 → 타입 검사 → 테스트 → 웹 빌드 순서다", () => {
    const order = steps("checks")
      .map((s) => String(s.run ?? ""))
      .filter((r) => r !== "");
    expect(order).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm test",
      "pnpm --filter @newsplatform/web build",
    ]);
  });
});

describe("ci.yml migration-smoke 잡", () => {
  const job = () => jobs["migration-smoke"];

  it("서비스 컨테이너는 pgvector PostgreSQL 17 이미지를 digest로 고정한다", () => {
    const image: string = job().services.postgres.image;
    expect(image).toMatch(/^pgvector\/pgvector:[0-9.]+-pg17@sha256:[0-9a-f]{64}$/);
  });

  it("서비스 컨테이너는 헬스 체크(pg_isready)를 선언한다", () => {
    expect(String(job().services.postgres.options)).toContain("pg_isready");
  });

  it("일회용 자격은 워크플로 안에서 run_id로 만들고 DATABASE_MIGRATION_URL이 localhost를 가리킨다", () => {
    const svc = job().services.postgres.env;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions 표현식 `${{ }}`을 문자 그대로 검사한다
    expect(svc.POSTGRES_PASSWORD).toBe("ci-${{ github.run_id }}");
    expect(svc.POSTGRES_USER).toBe("ci");
    expect(svc.POSTGRES_DB).toBe("newsplatform_ci");
    expect(job().env.DATABASE_MIGRATION_URL).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions 표현식 `${{ }}`을 문자 그대로 검사한다
      "postgresql://ci:ci-${{ github.run_id }}@localhost:5432/newsplatform_ci",
    );
    expect(job().env.DATABASE_URL).toBeUndefined();
  });

  it("서버 메이저 17을 확인한 뒤 db:migrate → db:gate 순으로 실행한다", () => {
    const r = runs("migration-smoke");
    expect(r).toContain("show server_version_num");
    expect(r).toContain("pnpm db:migrate");
    expect(r).toContain("pnpm db:gate");
    expect(r.indexOf("show server_version_num")).toBeLessThan(r.indexOf("pnpm db:migrate"));
    expect(r.indexOf("pnpm db:migrate")).toBeLessThan(r.indexOf("pnpm db:gate"));
  });

  it("픽스처 DB 마이그레이션 검사는 M2a로 미룬다고 주석에 남긴다", () => {
    expect(text).toContain("M2a");
    expect(text).toContain("픽스처 DB");
  });

  it("유료 모델 호출 흔적이 없다(OPENAI 변수 없음)", () => {
    expect(text).not.toMatch(/OPENAI/i);
  });
});

describe("e2e 잡은 적재된 DB 위에서 돈다", () => {
  it("Postgres 서비스를 고정 digest로 띄운다", () => {
    const image = String(jobs.e2e.services.postgres.image);
    expect(image).toMatch(/^pgvector\/pgvector:0\.8\.6-pg17@sha256:[0-9a-f]{64}$/);
  });

  it("마이그레이션 → 실 DB 테스트 → 데모 적재 → 빌드 순서다", () => {
    const names = steps("e2e").map((s) => String(s.name ?? ""));
    const migrate = names.indexOf("빈 DB 마이그레이션 적용(drizzle)");
    const dbTests = names.indexOf("실 DB 테스트(db·worker)");
    const load = names.indexOf("데모 사건 적재");
    const build = names.indexOf("웹 프로덕션 빌드");
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(migrate).toBeLessThan(dbTests);
    expect(dbTests).toBeLessThan(load);
    expect(load).toBeLessThan(build);
    expect(runs("e2e")).toContain("pnpm test --project db --project worker");
    expect(runs("e2e")).toContain("pnpm --filter @newsplatform/worker demo:load");
  });

  it("e2e 잡은 마이그레이션 URL과 런타임 URL을 둘 다 갖는다(시크릿 아님)", () => {
    const env = jobs.e2e.env as Record<string, string>;
    expect(env.DATABASE_MIGRATION_URL).toMatch(/^postgresql:\/\/ci:/);
    expect(env.DATABASE_URL).toMatch(/^postgresql:\/\/ci:/);
    expect(text).not.toMatch(/secrets\./);
  });
});
