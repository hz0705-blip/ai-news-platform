import type { Source, Topic } from "@newstrail/domain";
import type { CandidateArticle, LocalPacket, StoryCandidate } from "./packet.ts";

/** 테스트용 가상 기사(직접 쓴 텍스트). */
export function fakeArticle(
  id: string,
  body: string,
  publishedAt = "2026-09-01T00:00:00.000Z",
): CandidateArticle {
  return {
    articleId: id,
    articleVersionId: `${id}-v1`,
    sourceId: `src-${id}`,
    url: `https://example.test/news/${id}`,
    normalizedUrl: `example.test/news/${id}`,
    publishedAt,
    title: `Imaginary headline number ${id} about the harbor festival`,
    description: `A made-up description for article ${id} covering the lantern parade`,
    body,
  };
}

export function fakeStory(storyId: string, topic: Topic, articleCount: number): StoryCandidate {
  return {
    storyId,
    topic,
    articles: Array.from({ length: articleCount }, (_, i) =>
      fakeArticle(
        `${storyId}-${i + 1}`,
        `The fictional mayor of Lanternville opened the pier on day ${i + 1}. Officials said 40 boats joined.`,
      ),
    ),
  };
}

/** 기사 둘짜리 가상 패킷. */
export function fakePacket(): LocalPacket {
  return {
    packetId: "dev-01",
    storyId: "story-x",
    topic: "기술·AI",
    sizeClass: "기사 2~4개",
    storyArticleCount: 2,
    articles: [
      {
        ...fakeArticle(
          "x1",
          "The robot fair opened in Gearton. It drew large crowds. Organizers expect more visitors next year.",
        ),
        key: "a1",
      },
      {
        ...fakeArticle(
          "x2",
          "Gearton hosted a robot fair this week. Attendance was high. The venue was the old mill.",
        ),
        key: "a2",
      },
    ],
  };
}

/** 패킷 기사의 출처(가상, 본문 처리 등급). */
export function fakeSources(packets: readonly LocalPacket[]): Source[] {
  return packets.flatMap((p) =>
    p.articles.map((a) => ({
      id: a.sourceId,
      name: `Imaginary Source ${a.sourceId}`,
      rightsTier: "본문 처리 + 발췌 표시" as const,
      region: "미확인",
      ownership: "unknown",
      language: "en",
      isFictional: true,
    })),
  );
}
