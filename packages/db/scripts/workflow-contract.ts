import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/**
 * 워크플로 계약 테스트(ci-workflow.test.ts·backup-workflow.test.ts)가 쓰는 YAML 로더.
 * 파싱 결과를 이 파일의 타입으로 좁히는 단언은 여기 한 곳에만 둔다.
 */
export type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
export type Job = {
  steps: Step[];
  environment?: string;
  env?: Record<string, string>;
  services?: Record<string, { image?: string; options?: string }>;
};
export type Workflow = {
  on: Record<string, unknown>;
  permissions: unknown;
  env?: Record<string, string>;
  jobs: Record<string, Job>;
};

/** 저장소 루트 기준 경로(예: ".github/workflows/ci.yml")의 워크플로를 읽는다. */
export function loadWorkflow(relPath: string) {
  const path = fileURLToPath(new URL(`../../../${relPath}`, import.meta.url));
  const text = readFileSync(path, "utf8");
  const workflow = parse(text) as Workflow;
  const jobs = Object.values(workflow.jobs);
  const steps = jobs.flatMap((job) => job.steps);
  const uses = steps.filter((s) => typeof s.uses === "string");
  return { text, workflow, jobs, steps, uses };
}
