import { DISPLAY_POLICY_VERSION } from "@newsplatform/domain";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { StoryPage } from "../../../components/story/story-page.tsx";
import { getLatestRevisionPointer, getStoryRevisionView } from "../../../lib/story-cache.ts";

// 사건 URL: 최신 개정판 포인터를 한 번 해소한 뒤 그 개정판의 화면 모델을 한 번 읽는다.
export default async function StoryRoute({
  params,
}: PageProps<"/story/[slug]">): Promise<ReactElement> {
  const { slug } = await params;
  const pointer = await getLatestRevisionPointer(slug);
  if (pointer === undefined) notFound();
  const view = await getStoryRevisionView(
    pointer.storyId,
    pointer.revisionId,
    "ko",
    DISPLAY_POLICY_VERSION,
    slug,
  );
  if (view === undefined) notFound();
  return <StoryPage view={view} />;
}
