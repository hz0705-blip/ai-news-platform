/**
 * 발행 뒤 웹의 인증 라우트(`apps/web/app/api/revalidate/route.ts`)를 불러 캐시 태그를 무효화한다
 * (스펙 "배포와 운영" 렌더링·캐시). `WEB_REVALIDATE_URL`·`REVALIDATE_SECRET`이 둘 다 있을 때만 만든다.
 */
export function createCacheInvalidator(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch = fetch,
): ((tags: readonly string[]) => Promise<void>) | undefined {
  const url = env.WEB_REVALIDATE_URL;
  const secret = env.REVALIDATE_SECRET;
  if (!url || !secret) return undefined;
  return async (tags) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    if (!response.ok) throw new Error(`캐시 무효화 실패: HTTP ${response.status}`);
  };
}
