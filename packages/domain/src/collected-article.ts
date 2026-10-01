import type { Topic } from "./topic.ts";

/**
 * 수집 단계가 출처 어댑터(GNews)에서 받아 정확 중복 제거로 넘기는 기사 한 건.
 * 아직 기사 식별자·사건이 없고 본문은 원문 그대로다. 정규화·해시·식별자는 `dedupeExact`가 붙인다.
 * `externalId`는 제공자의 기사 식별자이며 보조 기록일 뿐 동일성 키가 아니다
 * (docs/spec/v1.md "개발 중 결정 항목" 정확 중복 제거).
 */
export interface CollectedArticle {
  readonly sourceId: string;
  readonly externalId: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly publishedAt: Date;
  readonly topics: readonly Topic[];
  readonly rawBody: string;
  /** 출처 기사의 이미지 URL(`toImageUrl`로 검증한 값). 없으면 생략한다. */
  readonly imageUrl?: string;
}
