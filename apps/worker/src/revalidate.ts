/** 캐시 무효화 요청. `immediate`면 stale-while-revalidate 없이 즉시 만료한다(권리 등급 변경, #78). */
export type CacheInvalidator = (
  tags: readonly string[],
  options?: { readonly immediate?: boolean },
) => Promise<void>;

/**
 * 발행 뒤 웹의 인증 라우트(`apps/web/app/api/revalidate/route.ts`)를 불러 캐시 태그를 무효화한다
 * (스펙 "배포와 운영" 렌더링·캐시). `WEB_REVALIDATE_URL`·`REVALIDATE_SECRET`이 둘 다 있을 때만 만든다.
 */
export function createCacheInvalidator(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch = fetch,
): CacheInvalidator | undefined {
  const url = env.WEB_REVALIDATE_URL;
  const secret = env.REVALIDATE_SECRET;
  if (!url || !secret) return undefined;
  return async (tags, options) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(options?.immediate ? { tags, immediate: true } : { tags }),
    });
    if (!response.ok) throw new Error(`캐시 무효화 실패: HTTP ${response.status}`);
  };
}
