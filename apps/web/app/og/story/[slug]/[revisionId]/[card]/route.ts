import { DISPLAY_POLICY_VERSION } from "@newstrail/domain";
import { loadOgFonts, ogCardResponse } from "../../../../../../lib/og-image.tsx";
import {
  decodeSegment,
  isCardSegment,
  type OgStoryCard,
  toOgStoryCard,
} from "../../../../../../lib/share-card.ts";
import {
  getLatestRevisionPointer,
  getStoryRevisionView,
} from "../../../../../../lib/story-cache.ts";

/**
 * 사건 개정판의 공유 카드 PNG(`/og/story/<slug>/<revisionId>/ko-t<템플릿>-f<폰트>.png`).
 * 사건 페이지와 같은 캐시(최신 포인터로 slug → 사건 해소, 개정판 화면 모델)를 읽는다. 없거나 실패하면 안전 카드.
 */
async function loadCard(slug: string, revisionId: string): Promise<OgStoryCard | undefined> {
  const pointer = await getLatestRevisionPointer(slug);
  if (pointer === undefined) return undefined;
  const view = await getStoryRevisionView(
    pointer.storyId,
    revisionId,
    "ko",
    DISPLAY_POLICY_VERSION,
    slug,
  );
  return view === undefined ? undefined : toOgStoryCard(view);
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/og/story/[slug]/[revisionId]/[card]">,
): Promise<Response> {
  const { slug, revisionId: rawRevisionId, card: segment } = await params;
  const revisionId = decodeSegment(rawRevisionId);
  const [card, fonts] = await Promise.all([
    revisionId === undefined || !isCardSegment(segment)
      ? undefined
      : loadCard(slug, revisionId).catch(() => undefined),
    loadOgFonts().catch(() => undefined),
  ]);
  return ogCardResponse(card, fonts);
}
