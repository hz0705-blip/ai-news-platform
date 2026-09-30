import { TOPICS } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import {
  assertNoArticleText,
  DEV_SET_SEED,
  type StoryCandidate,
  sampleDevSet,
  toDevSet,
} from "./packet.ts";
import { fakeStory } from "./testing.ts";

function population(): StoryCandidate[] {
  const stories: StoryCandidate[] = [];
  TOPICS.forEach((topic, t) => {
    for (let i = 0; i < 12; i += 1) stories.push(fakeStory(`s-${t}-single-${i}`, topic, 1));
    for (let i = 0; i < 6; i += 1) stories.push(fakeStory(`s-${t}-mid-${i}`, topic, 2 + (i % 3)));
  });
  // 5개 이상은 한 토픽에만 넷(프로덕션 현황과 같은 모양).
  for (let i = 0; i < 4; i += 1) stories.push(fakeStory(`s-0-large-${i}`, TOPICS[0], 5 + i * 3));
  return stories;
}

describe("골든셋 개발셋 표집", () => {
  it("표집은 같은 시드면 같은 패킷을 고른다", () => {
    const first = sampleDevSet(population(), DEV_SET_SEED);
    const again = sampleDevSet([...population()].reverse(), DEV_SET_SEED);
    expect(again).toEqual(first);
    expect(sampleDevSet(population(), "other-seed").map((p) => p.storyId)).not.toEqual(
      first.map((p) => p.storyId),
    );

    const composition = toDevSet(first, DEV_SET_SEED).composition;
    expect(first).toHaveLength(20);
    expect(composition.actual).toEqual({ 단독: 4, "기사 2~4개": 12, "기사 5개 이상": 4 });
    expect(Object.values(composition.byTopic)).toEqual([5, 5, 5, 5]);
    // 기사 수 상한 6, 기사 키는 발행 순.
    expect(Math.max(...first.map((p) => p.articles.length))).toBe(6);
    expect(first[0]?.articles.map((a) => a.key)).toEqual(
      first[0]?.articles.map((_, i) => `a${i + 1}`),
    );
  });

  it("저장소 산출물에 기사 본문·제목·설명 문자열이 없다", () => {
    const packets = sampleDevSet(population(), DEV_SET_SEED);
    const output = JSON.stringify(toDevSet(packets, DEV_SET_SEED), null, 2);
    expect(() => assertNoArticleText(output, packets)).not.toThrow();

    const article = packets[0]?.articles[0];
    if (article === undefined) throw new Error("패킷 없음");
    for (const leaked of [
      article.body.slice(3, 23),
      article.title.slice(0, 20),
      article.description?.slice(5, 30) ?? "",
    ]) {
      expect(() => assertNoArticleText(`${output}${leaked}`, packets)).toThrow(/기사 텍스트/);
    }
    // 20자 미만 겹침은 허용한다.
    expect(() => assertNoArticleText(article.body.slice(0, 19), packets)).not.toThrow();
  });
});
