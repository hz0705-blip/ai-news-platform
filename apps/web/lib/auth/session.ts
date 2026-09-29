import type { JwtPayload, SupabaseClient, User } from "@supabase/supabase-js";

/**
 * 검증된 현재 사용자 ID(스펙 "계정"). 모든 Server Action·Route Handler가 이 값을 소유자 조건으로 건다.
 * 1) `getClaims()`로 JWT 서명·만료를 검증하고 2) 서명된 `session_id`의 세션이 Auth 서버에 아직 있는지 확인한다 —
 * Auth `/user`(getUser)는 JWT의 `session_id` 세션이 지워졌으면 거부하므로, 로그아웃·삭제·폐기된 세션의 토큰은
 * 만료 전이라도 여기서 막힌다. 요청 데이터를 읽으므로 `use cache` 함수 안에서 부르지 않는다.
 */
export async function verifiedUserId(client: SupabaseClient | null): Promise<string | null> {
  return (await verifiedSession(client))?.user.id ?? null;
}

/** `verifiedUserId`와 같은 검증을 하고 Auth 서버가 돌려준 사용자(제공자 연결 목록 포함)와 검증된 클레임을 함께 준다(계정 삭제). */
export async function verifiedSession(
  client: SupabaseClient | null,
): Promise<{ user: User; claims: JwtPayload } | null> {
  if (client === null) return null;
  const { data, error } = await client.auth.getClaims();
  if (error !== null || data === null) return null;
  const { sub, session_id: sessionId } = data.claims;
  if (typeof sub !== "string" || typeof sessionId !== "string" || sessionId === "") return null;
  const { data: current, error: sessionError } = await client.auth.getUser();
  if (sessionError !== null || current.user?.id !== sub) return null;
  return { user: current.user, claims: data.claims };
}
