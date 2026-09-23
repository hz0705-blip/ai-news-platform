import { DISPLAY_POLICY_VERSION } from "@newsplatform/domain";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { StoryPage } from "../../../../../components/story/story-page.tsx";
import { getLatestRevisionPointer, getStoryRevisionView } from "../../../../../lib/story-cache.ts";

// 개정판 고정 URL: 포인터는 slug → stories.id 해소에만 쓰고 포인터의 개정판은 무시한다.
// 개정판 식별자에는 `:`가 들어가고 Next는 동적 세그먼트를 인코딩된 채 넘기므로 한 번 디코딩한다.
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

export default async function StoryRevisionRoute({
  params,
}: PageProps<"/story/[slug]/revision/[revisionId]">): Promise<ReactElement> {
  const { slug, revisionId: rawRevisionId } = await params;
  const revisionId = decodeSegment(rawRevisionId);
  if (revisionId === undefined) notFound();
  const pointer = await getLatestRevisionPointer(slug);
  if (pointer === undefined) notFound();
  const view = await getStoryRevisionView(
    pointer.storyId,
    revisionId,
    "ko",
    DISPLAY_POLICY_VERSION,
    slug,
  );
  if (view === undefined) notFound();
  return <StoryPage view={view} />;
}
