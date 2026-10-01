import { DISPLAY_POLICY_VERSION } from "@newstrail/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { StoryPage } from "../../../../../components/story/story-page.tsx";
import { decodeSegment, storyMetadata } from "../../../../../lib/share-card.ts";
import { getLatestRevisionPointer, getStoryRevisionView } from "../../../../../lib/story-cache.ts";
import { asOlderRevision, type StoryView } from "../../../../../lib/story-view.ts";

type Props = PageProps<"/story/[slug]/revision/[revisionId]">;

// 개정판 고정 URL: 포인터는 slug → stories.id 해소와 최신 여부 판정에 쓴다.
// 개정판 식별자에는 `:`가 들어가고 Next는 동적 세그먼트를 인코딩된 채 넘기므로 한 번 디코딩한다.
async function loadRevisionView({ params }: Props): Promise<StoryView | undefined> {
  const { slug, revisionId: rawRevisionId } = await params;
  const revisionId = decodeSegment(rawRevisionId);
  if (revisionId === undefined) return undefined;
  const pointer = await getLatestRevisionPointer(slug);
  if (pointer === undefined) return undefined;
  const view = await getStoryRevisionView(
    pointer.storyId,
    revisionId,
    "ko",
    DISPLAY_POLICY_VERSION,
    slug,
  );
  // 띠는 표시 개정판까지의 전체 이력이다. 발행 직후 포인터 캐시가 뒤처져도
  // 이미 더 새 개정판을 보는 화면을 이전 개정판으로 되돌려 안내하지 않는다.
  if (view === undefined || view.revisions.some((revision) => revision.id === pointer.revisionId))
    return view;
  return asOlderRevision(view);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const view = await loadRevisionView(props);
  return view === undefined ? {} : storyMetadata(view);
}

export default async function StoryRevisionRoute(props: Props): Promise<ReactElement> {
  const view = await loadRevisionView(props);
  if (view === undefined) notFound();
  return <StoryPage view={view} />;
}
