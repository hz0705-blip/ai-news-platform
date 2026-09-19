import { defineConfig } from "vitest/config";

// 패키지 다섯을 Vitest 하나로 돌린다. 웹만 jsdom, 나머지는 node (docs/spec/v1.md "테스트 결정").
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "web", root: "./apps/web", environment: "jsdom" },
        // Next.js tsconfig는 jsx: preserve라 Vitest(oxc)가 JSX를 변환하도록 여기서 지정한다.
        oxc: { jsx: { runtime: "automatic" } },
      },
      { test: { name: "worker", root: "./apps/worker", environment: "node" } },
      { test: { name: "domain", root: "./packages/domain", environment: "node" } },
      { test: { name: "db", root: "./packages/db", environment: "node" } },
      { test: { name: "pipeline", root: "./packages/pipeline", environment: "node" } },
    ],
  },
});
