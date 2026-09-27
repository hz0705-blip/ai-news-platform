import type { Topic } from "./topic.ts";

/**
 * 기사(Article): 한 출처가 발행한 원문 하나 (CONTEXT.md "기사").
 * 본문은 여기 없다 — 정규화된 본문은 기사 버전(`ArticleVersion`)이 갖는다.
 * `storyId`는 배치가 배정한 사건이다(docs/spec/v1.md "사건 배정").
 * `topics`는 이 기사를 가져온 수집 쿼리의 토픽들이다 — 여러 토픽 쿼리에서 온 기사는 합집합을 가진다
 * (docs/spec/v1.md "개발 중 결정 항목" 토픽→GNews 쿼리와 다중 토픽).
 */
export interface Article {
  readonly id: string;
  readonly sourceId: string;
  readonly storyId: string;
  readonly url: string;
  readonly title: string;
  readonly publishedAt: Date;
  readonly topics: readonly Topic[];
}
