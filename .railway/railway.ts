import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * Railway IaC(#57, 스펙 "배포와 운영"): 워커 서비스 하나. 적용은 `railway config plan` → `railway config apply`.
 * 변수 값은 여기 두지 않는다(이름은 .env.example, 설정은 `railway variable set`). preserve()는 대시보드에 있는 값을 유지한다.
 */
export default defineRailway(() =>
  project("ai-news-platform", {
    resources: [
      service("worker", {
        source: github("hz0705-blip/ai-news-platform", { branch: "main" }),
        env: {
          WORKER_DATABASE_URL: preserve(),
          OPENAI_API_KEY: preserve(),
          GNEWS_API_KEY: preserve(),
          WEB_REVALIDATE_URL: preserve(),
          REVALIDATE_SECRET: preserve(),
          PIPELINE_DAILY_BUDGET_USD: preserve(),
        },
        build: {
          builder: "RAILPACK",
          watchPatterns: [
            "apps/worker/**",
            "packages/**",
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            ".railway/**",
          ],
        },
        // 싱가포르 1개, 슬립 끔(스펙: 상시 서비스). SIGTERM 뒤 진행 중 배치를 잡 만료(90분)까지 기다린다.
        replicas: { "asia-southeast1-eqsg3a": 1 },
        deploy: {
          startCommand: "pnpm --filter @newsplatform/worker start",
          region: "asia-southeast1-eqsg3a",
          sleepApplication: false,
          restartPolicyType: "ON_FAILURE",
          restartPolicyMaxRetries: 10,
          drainingSeconds: 5400,
        },
      }),
    ],
  }),
);
