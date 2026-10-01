import { defineConfig } from "vitest/config";

// 패키지 다섯을 Vitest 하나로 돌린다. 웹만 jsdom, 나머지는 node (docs/spec/v1.md "테스트 결정").
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "web",
          root: "./apps/web",
          environment: "jsdom",
          exclude: ["e2e/**", "node_modules/**"],
        },
        // Next.js tsconfig는 jsx: preserve라 Vitest(oxc)가 JSX를 변환하도록 여기서 지정한다.
        oxc: { jsx: { runtime: "automatic" } },
      },
      // 실 DB 테스트(db·worker)는 세션 advisory lock으로 직렬화되고 그 대기가 테스트 시간에 들어가므로 여유를 둔다.
      { test: { name: "worker", root: "./apps/worker", environment: "node", testTimeout: 60_000 } },
      { test: { name: "domain", root: "./packages/domain", environment: "node" } },
      { test: { name: "db", root: "./packages/db", environment: "node", testTimeout: 60_000 } },
      { test: { name: "pipeline", root: "./packages/pipeline", environment: "node" } },
      { test: { name: "scripts", root: "./scripts", environment: "node" } },
    ],
  },
});
