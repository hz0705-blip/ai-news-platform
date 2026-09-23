import { loadPublishedStory } from "@newsplatform/db";
import { cacheTag } from "next/cache";
import { getRuntimeDb } from "./db.ts";
import { buildStoryView, type StoryView } from "./story-view.ts";

/** 사건의 최신 발행 개정판을 가리키는 포인터. `storyId`는 slug가 아니라 `stories.id`다. */
export interface LatestRevisionPointer {
  readonly storyId: string;
  readonly revisionId: string;
}

/**
 * slug → (storyId, 최신 revisionId). 캐시 키는 인자(slug), 태그 `story:<storyId>:latest`는 무효화 그룹이다.
 * storyId는 질의 뒤에야 알 수 있어 태그는 해소 직후에 붙인다. 사건이 없으면 `undefined`.
 */
export async function getLatestRevisionPointer(
  slug: string,
): Promise<LatestRevisionPointer | undefined> {
  "use cache";
  const data = await loadPublishedStory(getRuntimeDb().db, { slug });
  if (data === undefined) return undefined;
  cacheTag(`story:${data.story.id}:latest`);
  return { storyId: data.story.id, revisionId: data.revision.id };
}

/**
 * (사건, 개정판, 언어, 표시 정책 버전) 키의 불변 화면 모델. 태그는 무효화 그룹으로만 쓴다.
 * `slug`는 질의(`loadPublishedStory`)가 slug로만 사건을 찾기 때문에 받는다 — slug와 storyId는 1:1이다.
 */
export async function getStoryRevisionView(
  storyId: string,
  revisionId: string,
  language: "ko",
  displayPolicyVersion: number,
  slug: string,
): Promise<StoryView | undefined> {
  "use cache";
  cacheTag(`story:${storyId}:rev:${revisionId}:${language}:v${displayPolicyVersion}`);
  const data = await loadPublishedStory(getRuntimeDb().db, { slug, revisionId });
  if (data === undefined || data.story.id !== storyId) return undefined;
  return buildStoryView(data);
}
