import type { Topic } from "./topic.ts";

/**
 * 사건 수명(Story Lifecycle) 3종 (CONTEXT.md "사건 수명").
 * 사건이 새 기사를 받을 수 있는지 나타낸다. 종료는 운영자만 다시 연다.
 */
export const STORY_LIFECYCLES = ["활성", "휴면", "종료"] as const;

export type StoryLifecycle = (typeof STORY_LIFECYCLES)[number];

/**
 * 사건(Story): 여러 기사가 다루는 하나의 실제 일 (CONTEXT.md "사건").
 * 사용자가 여는 페이지의 단위이며 URL은 `slug`로 찾는다. 사건의 상충 상태는
 * 여기 저장하지 않고 개정판마다 주장들에서 파생한다(ADR-0009).
 * `isDemo`는 데모 사건 표시용이다(CONTEXT.md "데모 사건").
 */
export interface Story {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly topics: readonly Topic[];
  readonly isDemo: boolean;
  readonly lifecycle: StoryLifecycle;
}
