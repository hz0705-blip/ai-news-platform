import type { Topic } from "./topic.ts";

/**
 * 기사(Article): 한 출처가 발행한 원문 하나 (CONTEXT.md "기사").
 * 본문은 여기 없다 — 정규화된 본문은 기사 버전(`ArticleVersion`)이 갖는다.
 * `storyId`는 배치가 배정한 사건이다(docs/spec/v1.md "사건 배정").
 */
export interface Article {
  readonly id: string;
  readonly sourceId: string;
  readonly storyId: string;
  readonly url: string;
  readonly title: string;
  readonly publishedAt: Date;
  readonly topic: Topic;
}
