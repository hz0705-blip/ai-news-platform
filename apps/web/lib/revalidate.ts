/** `POST /api/revalidate`의 인증과 본문 검사(#55). 라우트 파일은 핸들러만 내보낼 수 있어 여기 둔다. */
const MAX_TAGS = 500;

/** 본문 `{ tags: string[] }`(비어 있지 않은 문자열 1~500개). 아니면 `undefined`. */
export function parseTags(body: unknown): string[] | undefined {
  if (typeof body !== "object" || body === null || !("tags" in body)) return undefined;
  const { tags } = body;
  if (!Array.isArray(tags) || tags.length === 0 || tags.length > MAX_TAGS) return undefined;
  return tags.every((tag) => typeof tag === "string" && tag.length > 0) ? tags : undefined;
}

export function authorize(
  authorization: string | null,
  secret: string | undefined,
): "ok" | "unauthorized" | "not-configured" {
  if (!secret) return "not-configured";
  if (authorization !== `Bearer ${secret}`) return "unauthorized";
  return "ok";
}
