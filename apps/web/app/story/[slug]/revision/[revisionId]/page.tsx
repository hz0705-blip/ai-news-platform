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
  // 불변 캐시의 띠는 이 개정판까지만 실으므로 최신 여부는 최신 포인터로 정한다.
  if (view === undefined || view.revisionId === pointer.revisionId) return view;
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
