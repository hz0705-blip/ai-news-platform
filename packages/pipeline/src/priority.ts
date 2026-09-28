import { TOPICS, type Topic } from "@newsplatform/domain";

/** 우선순위를 정하는 데 필요한 사건 하나의 값. */
export interface PriorityInput {
  readonly storyId: string;
  readonly articleCount: number;
  readonly topics: readonly Topic[];
  /** 이전 배치가 미룬 시각. 있으면 맨 앞이다. */
  readonly deferredSince?: Date;
}

function topicRank(topics: readonly Topic[]): number {
  const ranks = topics.map((topic) => TOPICS.indexOf(topic)).filter((rank) => rank >= 0);
  return ranks.length === 0 ? TOPICS.length : Math.min(...ranks);
}

/**
 * 한도 도달 시 처리 순서(docs/spec/v1.md "배치와 비용"): 이전 배치가 미룬 사건(먼저 미룬 순) →
 * 기사가 많이 붙은 사건 → 토픽 순서(`TOPICS`) → 사건 식별자(결정론). 입력을 바꾸지 않고 새 배열을 준다.
 */
export function prioritizeStories<T extends PriorityInput>(stories: readonly T[]): T[] {
  return [...stories].sort((a, b) => {
    if (a.deferredSince !== undefined || b.deferredSince !== undefined) {
      if (a.deferredSince === undefined) return 1;
      if (b.deferredSince === undefined) return -1;
      const byDeferred = a.deferredSince.getTime() - b.deferredSince.getTime();
      if (byDeferred !== 0) return byDeferred;
    }
    if (a.articleCount !== b.articleCount) return b.articleCount - a.articleCount;
    const byTopic = topicRank(a.topics) - topicRank(b.topics);
    if (byTopic !== 0) return byTopic;
    return a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0;
  });
}
