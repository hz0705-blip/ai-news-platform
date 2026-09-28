import { revalidateTag } from "next/cache";
import { authorize, parseTags } from "../../../lib/revalidate.ts";

/**
 * 발행 뒤 캐시 무효화 라우트(#55, 스펙 "배포와 운영" 렌더링·캐시): 워커가 개정판 커밋 뒤 `Bearer REVALIDATE_SECRET`으로
 * 태그 목록을 보내면 그 태그(`today:ko`, `story:<id>:latest`)를 만료한다. 시크릿이 설정되지 않은 배포에서는 항상 거부한다.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = authorize(request.headers.get("authorization"), process.env.REVALIDATE_SECRET);
  if (auth === "not-configured") return Response.json({ error: "not configured" }, { status: 503 });
  if (auth === "unauthorized") return Response.json({ error: "unauthorized" }, { status: 401 });
  const tags = parseTags(await request.json().catch(() => undefined));
  if (tags === undefined) return Response.json({ error: "invalid body" }, { status: 400 });
  for (const tag of tags) revalidateTag(tag, "max");
  return Response.json({ revalidated: tags.length });
}
