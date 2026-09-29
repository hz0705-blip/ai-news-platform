import { randomUUID } from "node:crypto";
import { type BrowserContext, test as base, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * E2E 인증 이음새(스펙 "테스트 결정" 2): 로컬 Supabase CLI Auth의 이메일·비밀번호 사용자.
 * `auth.admin.createUser`로 만들고 실제 `@supabase/ssr` 서버 어댑터(메모리 쿠키 저장소)로 로그인해 생긴 쿠키를
 * 그대로 브라우저 컨텍스트에 넣는다 — 쿠키·JWT를 손으로 만들지 않는다.
 * Kakao·Google 호스트로 가는 요청은 모든 컨텍스트에서 막고 테스트 끝에 실패로 본다.
 */
export type AuthEnv = { url: string; publishableKey: string; secretKey: string };

export function authEnv(): AuthEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  return url && publishableKey && secretKey ? { url, publishableKey, secretKey } : null;
}

function requireEnv(): AuthEnv {
  const env = authEnv();
  if (env === null) throw new Error("로컬 Supabase 환경변수가 없다(docs/agents/project.md 명령어)");
  return env;
}

export type TestUser = { id: string; email: string; password: string };

type Cookie = Parameters<BrowserContext["addCookies"]>[0][number];

const PROVIDER_HOST = /(^|\.)(kakao\.com|kakaocdn\.net|google\.com|googleapis\.com)$/i;

async function guardProviders(context: BrowserContext, hits: string[]): Promise<void> {
  await context.route(
    (url) => PROVIDER_HOST.test(url.hostname),
    (route) => {
      hits.push(route.request().url());
      return route.abort();
    },
  );
}

/** 실제 SSR 어댑터로 비밀번호 로그인해 어댑터가 쓴 쿠키를 Playwright 쿠키로 옮긴다. */
async function sessionCookies(user: TestUser, baseURL: string): Promise<Cookie[]> {
  const env = requireEnv();
  const jar = new Map<
    string,
    { value: string; options: { httpOnly?: boolean; maxAge?: number } }
  >();
  const client = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          if (value === "") jar.delete(name);
          else jar.set(name, { value, options });
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error !== null) throw error;
  expect(jar.size).toBeGreaterThan(0);
  const now = Math.floor(Date.now() / 1000);
  return [...jar].map(([name, { value, options }]) => ({
    name,
    value,
    url: baseURL,
    httpOnly: options.httpOnly ?? false,
    sameSite: "Lax",
    ...(options.maxAge === undefined ? {} : { expires: now + options.maxAge }),
  }));
}

type Fixtures = {
  providerHits: string[];
  makeUser: (label: string) => Promise<TestUser>;
  openAs: (user: TestUser | null, options?: { userAgent?: string }) => Promise<BrowserContext>;
  /** 이미 열린 컨텍스트에 세션을 넣는다(익명으로 시작해 로그인한 뒤를 흉내 낸다 — 제공자 흐름은 타지 않는다). */
  signIn: (context: BrowserContext, user: TestUser) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  providerHits: [
    async ({ context }, use) => {
      const hits: string[] = [];
      await guardProviders(context, hits);
      await use(hits);
      expect(hits, "Kakao·Google 호스트 요청").toEqual([]);
    },
    { auto: true },
  ],
  // biome-ignore lint/correctness/noEmptyPattern: Playwright 픽스처는 첫 인자를 구조 분해로만 받는다
  makeUser: async ({}, use) => {
    const env = requireEnv();
    const admin = createClient(env.url, env.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const made: TestUser[] = [];
    await use(async (label) => {
      const email = `e2e-${label}-${randomUUID()}@example.test`;
      const password = randomUUID();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error !== null) throw error;
      const user = { id: data.user.id, email, password };
      made.push(user);
      return user;
    });
    for (const user of made) await admin.auth.admin.deleteUser(user.id);
  },
  openAs: async ({ browser, baseURL, locale, timezoneId, providerHits }, use) => {
    if (baseURL === undefined) throw new Error("baseURL이 없다");
    const opened: BrowserContext[] = [];
    await use(async (user, options = {}) => {
      const context = await browser.newContext({
        baseURL,
        ...(locale === undefined ? {} : { locale }),
        ...(timezoneId === undefined ? {} : { timezoneId }),
        ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
      });
      opened.push(context);
      await guardProviders(context, providerHits);
      if (user !== null) await context.addCookies(await sessionCookies(user, baseURL));
      return context;
    });
    for (const context of opened) await context.close();
  },
  signIn: async ({ baseURL }, use) => {
    if (baseURL === undefined) throw new Error("baseURL이 없다");
    await use(async (context, user) => {
      await context.addCookies(await sessionCookies(user, baseURL));
    });
  },
});

export { expect };
