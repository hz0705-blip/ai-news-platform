import { defineConfig } from "@playwright/test";

// 병렬 워크트리는 E2E_PORT로 서로 다른 포트를 쓴다(scripts/cycle-start가 값을 출력한다).
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: `pnpm start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    // 사건 페이지는 적재된 DB를 읽는다. 로컬은 .env의 세션 풀러 URL, CI는 서비스 컨테이너 URL.
    // 인증은 로컬 Supabase CLI(e2e/auth.ts). NEXT_PUBLIC_*는 빌드 때 들어가므로 빌드도 같은 값으로 한다.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      // 계정 삭제(#106)의 Auth 관리자 API. 로컬 CLI 고정 값이다.
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "",
    },
  },
});
