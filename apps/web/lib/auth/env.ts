/**
 * 웹이 읽는 Supabase 공개 설정. 둘 중 하나라도 비면 null — 자격 없는 빌드(CI checks)와 키가 아직 없는 배포에서
 * 공개 화면은 그대로 두고 로그인만 쓸 수 없게 한다. secret 키(`SUPABASE_SECRET_KEY`)는 여기서 읽지 않는다.
 */
export type SupabaseEnv = { url: string; publishableKey: string };

export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/** 인증 콜백·로그아웃·로그인 시작·세션 응답의 캐시 헤더(스펙 "계정"). */
export const PRIVATE_NO_STORE = "private, no-store";
