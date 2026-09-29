import { loadOgFonts, ogCardResponse } from "../../../../lib/og-image.tsx";

/** 사이트 기본 카드 PNG(`/og/site/ko-t<템플릿>-f<폰트>.png`). 오늘·소개·검색이 쓴다. */
export async function GET(): Promise<Response> {
  return ogCardResponse("site", await loadOgFonts().catch(() => undefined));
}
