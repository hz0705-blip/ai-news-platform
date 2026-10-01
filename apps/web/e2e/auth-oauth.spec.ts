import { authEnv, expect, test } from "./auth.ts";

test.skip(authEnv() === null, "로컬 Supabase가 꺼져 있다(pnpm exec supabase start)");

for (const provider of ["kakao", "google"] as const) {
  test(`${provider} 로그인 시작·취소·위조 콜백은 외부 주소로 복귀하지 않고 재시도할 수 있다`, async ({
    page,
    baseURL,
  }) => {
    // 제공자 화면은 실제 계정 검증에서 별도로 확인한다. 이 테스트는 외부 로그인을 수행하지 않는다.
    await page.route("https://kauth.kakao.com/**", (route) => route.abort());
    await page.route("https://accounts.google.com/**", (route) => route.abort());
    const start = (next: string) =>
      page.request.get(`/auth/login/start?provider=${provider}&next=${encodeURIComponent(next)}`, {
        maxRedirects: 0,
      });
    const external = await start("//external.test/collect");
    expect(external.status()).toBe(303);
    const returnCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "auth-return-path",
    );
    expect(decodeURIComponent(returnCookie?.value ?? "")).toBe("/");

    const response = await start("/search");
    expect(response.status()).toBe(303);
    expect(response.headers()["cache-control"]).toMatch(/private.*no-store/);
    const authorize = new URL(response.headers().location ?? "");
    expect(authorize.origin).toBe(
      provider === "kakao" ? "https://kauth.kakao.com" : "https://accounts.google.com",
    );
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${baseURL}/auth/callback/${provider}`);
    expect(authorize.searchParams.has("client_secret")).toBe(false);

    const cancelled = await page.goto(
      `/auth/callback/${provider}?error=access_denied&state=${authorize.searchParams.get("state")}`,
    );
    expect(cancelled?.status()).toBe(200);
    await expect(page).toHaveURL(/\/auth\/login\?next=%2Fsearch$/);
    await expect(page.getByText("로그인을 완료하지 못했습니다.", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "로그인하지 않고 읽기로 돌아가기" }),
    ).toHaveAttribute("href", "/search");
    expect(
      (await page.context().cookies()).some(
        (cookie) =>
          cookie.name.startsWith(`${provider}-oidc-`) || cookie.name === "auth-return-path",
      ),
    ).toBe(false);

    await page.goto(`/auth/callback/${provider}?code=not-a-code&state=forged`);
    await expect(page).toHaveURL(/\/auth\/login\?next=%2F$/);
    await expect(
      page.getByRole("link", { name: "로그인하지 않고 읽기로 돌아가기" }),
    ).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "카카오로 계속하기" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Google로 계속하기" })).toBeVisible();
  });
}
