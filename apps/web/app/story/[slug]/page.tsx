import { DISPLAY_POLICY_VERSION } from "@newstrail/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { StoryPage } from "../../../components/story/story-page.tsx";
import { storyMetadata } from "../../../lib/share-card.ts";
import { getLatestRevisionPointer, getStoryRevisionView } from "../../../lib/story-cache.ts";
import type { StoryView } from "../../../lib/story-view.ts";

// 사건 URL: 최신 개정판 포인터를 한 번 해소한 뒤 그 개정판의 화면 모델을 한 번 읽는다.
// 메타데이터(공유 카드)와 본문은 같은 캐시 항목을 읽어 같은 개정판을 본다.
async function loadLatestView(slug: string): Promise<StoryView | undefined> {
  const pointer = await getLatestRevisionPointer(slug);
  if (pointer === undefined) return undefined;
  return getStoryRevisionView(
    pointer.storyId,
    pointer.revisionId,
    "ko",
    DISPLAY_POLICY_VERSION,
    slug,
  );
}

export async function generateMetadata({ params }: PageProps<"/story/[slug]">): Promise<Metadata> {
  const view = await loadLatestView((await params).slug);
  return view === undefined ? {} : storyMetadata(view);
}

export default async function StoryRoute({
  params,
}: PageProps<"/story/[slug]">): Promise<ReactElement> {
  const view = await loadLatestView((await params).slug);
  if (view === undefined) notFound();
  return <StoryPage view={view} />;
}
