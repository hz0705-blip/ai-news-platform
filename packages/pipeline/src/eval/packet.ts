import { sha256Hex, spanLength, splitSentences, TOPICS, type Topic } from "@newstrail/domain";
import type { DevPairs } from "./pairs.ts";

/**
 * 골든셋 개발셋(스펙 "골든셋과 평가", #147). 패킷 = 사건 하나의 기사 묶음.
 * 기사 본문·제목·설명은 `EVAL_DATA_DIR`의 패킷 파일(`LocalPacket`)에만 두고, 저장소에는 본문 없는
 * 목록(`DevSet`)만 커밋한다(`assertNoArticleText`로 검사).
 */

/** 개발셋 표집의 고정 시드. 바꾸면 다른 개발셋이다. */
export const DEV_SET_SEED = "golden-dev@1";
/** 개발셋 패킷 수와 토픽당 패킷 수. */
export const DEV_SET_SIZE = 20;
export const PACKETS_PER_TOPIC = 5;
/** 패킷 하나에 넣는 기사 수 상한(기사가 더 많은 사건은 시드 순위로 고른다). 비용·쌍 수를 묶는다. */
export const MAX_ARTICLES_PER_PACKET = 6;

export const SIZE_CLASSES = ["단독", "기사 2~4개", "기사 5개 이상"] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

/** 크기 구성 목표(합 20). */
export const SIZE_TARGETS: Readonly<Record<SizeClass, number>> = {
  단독: 4,
  "기사 2~4개": 12,
  "기사 5개 이상": 4,
};

export function sizeClassOf(articleCount: number): SizeClass {
  if (articleCount <= 1) return "단독";
  return articleCount <= 4 ? "기사 2~4개" : "기사 5개 이상";
}

/** 추출 입력: 데모가 아닌 사건 하나와 본문이 있는 기사들(링크만 기사·본문을 지운 기사 제외). */
export interface StoryCandidate {
  readonly storyId: string;
  readonly topic: Topic;
  readonly articles: readonly CandidateArticle[];
}

export interface CandidateArticle {
  readonly articleId: string;
  readonly articleVersionId: string;
  readonly sourceId: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly publishedAt: string;
  readonly title: string;
  readonly description: string | null;
  readonly body: string;
}

/** `EVAL_DATA_DIR/packets/<packetId>.json`. 기사 키는 발행 순 `a1`, `a2`, …. */
export interface LocalPacket {
  readonly packetId: string;
  readonly storyId: string;
  readonly topic: Topic;
  readonly sizeClass: SizeClass;
  /** 사건의 본문 있는 기사 수(상한으로 자르기 전). */
  readonly storyArticleCount: number;
  readonly articles: readonly (CandidateArticle & { readonly key: string })[];
}

/** 저장소 `packages/pipeline/eval/dev-set.json`: 식별자·해시·좌표 길이·수치만. */
export interface DevSet {
  readonly seed: string;
  readonly composition: {
    readonly target: Readonly<Record<SizeClass, number>>;
    readonly actual: Readonly<Record<SizeClass, number>>;
    readonly byTopic: Readonly<Record<string, number>>;
  };
  readonly packets: readonly {
    readonly packetId: string;
    readonly topic: Topic;
    readonly sizeClass: SizeClass;
    readonly storyArticleCount: number;
    readonly articles: readonly {
      readonly key: string;
      readonly url: string;
      readonly normalizedUrlHash: string;
      readonly sourceId: string;
      readonly publishedAt: string;
      readonly bodyHash: string;
      readonly codePointLength: number;
      readonly sentenceCount: number;
    }[];
  }[];
  /** 개발셋 기사 쌍 60개(`pairs.ts`): 사건 안 30 + 어려운 부정 30. */
  readonly pairs: DevPairs;
}

/** 시드 순위: 같은 시드·식별자면 늘 같은 값. 작은 값이 먼저 뽑힌다. */
export function seededRank(seed: string, id: string): string {
  return sha256Hex(`${seed}:${id}`);
}

function byRank<T>(seed: string, items: readonly T[], id: (item: T) => string): T[] {
  return [...items].sort((x, y) => (seededRank(seed, id(x)) < seededRank(seed, id(y)) ? -1 : 1));
}

/**
 * 개발셋 표집. 크기 구성 목표를 5개 이상 → 단독 → 2~4개 순으로 채우며, 각 단계에서 토픽을 돌아가며
 * (토픽당 5 이하) 그 토픽·크기의 시드 순위 첫 사건을 고른다. 목표를 못 채운 크기가 있어 20에 모자라면
 * 남은 자리를 2~4개 → 단독 → 5개 이상 순으로 같은 방식으로 채운다. 그래도 모자라면 있는 만큼이다.
 */
export function sampleDevSet(candidates: readonly StoryCandidate[], seed: string): LocalPacket[] {
  const eligible = candidates.filter((c) => c.articles.length > 0);
  const ranked = byRank(seed, eligible, (c) => c.storyId);
  const picked: StoryCandidate[] = [];
  const pickedIds = new Set<string>();
  const topicCount = (topic: Topic) => picked.filter((p) => p.topic === topic).length;
  const classCount = (size: SizeClass) =>
    picked.filter((p) => sizeClassOf(p.articles.length) === size).length;

  const fill = (size: SizeClass, limit: number) => {
    let progressed = true;
    while (progressed && classCount(size) < limit && picked.length < DEV_SET_SIZE) {
      progressed = false;
      for (const topic of TOPICS) {
        if (classCount(size) >= limit || picked.length >= DEV_SET_SIZE) break;
        if (topicCount(topic) >= PACKETS_PER_TOPIC) continue;
        const next = ranked.find(
          (c) =>
            !pickedIds.has(c.storyId) &&
            c.topic === topic &&
            sizeClassOf(c.articles.length) === size,
        );
        if (next === undefined) continue;
        picked.push(next);
        pickedIds.add(next.storyId);
        progressed = true;
      }
    }
  };

  fill("기사 5개 이상", SIZE_TARGETS["기사 5개 이상"]);
  fill("단독", SIZE_TARGETS.단독);
  fill("기사 2~4개", SIZE_TARGETS["기사 2~4개"]);
  fill("기사 2~4개", DEV_SET_SIZE);
  fill("단독", DEV_SET_SIZE);
  fill("기사 5개 이상", DEV_SET_SIZE);

  // 패킷 순서는 토픽 순서 → 크기 → 시드 순위로 고정한다.
  const order = (c: StoryCandidate) =>
    `${TOPICS.indexOf(c.topic)}:${SIZE_CLASSES.indexOf(sizeClassOf(c.articles.length))}:${seededRank(seed, c.storyId)}`;
  return [...picked]
    .sort((x, y) => (order(x) < order(y) ? -1 : 1))
    .map((story, index) => toPacket(story, `dev-${String(index + 1).padStart(2, "0")}`, seed));
}

function toPacket(story: StoryCandidate, packetId: string, seed: string): LocalPacket {
  const chosen = byRank(seed, story.articles, (a) => a.articleId).slice(0, MAX_ARTICLES_PER_PACKET);
  const articles = chosen
    .sort((x, y) =>
      x.publishedAt === y.publishedAt
        ? x.articleId < y.articleId
          ? -1
          : 1
        : x.publishedAt < y.publishedAt
          ? -1
          : 1,
    )
    .map((article, index) => ({ ...article, key: `a${index + 1}` }));
  return {
    packetId,
    storyId: story.storyId,
    topic: story.topic,
    sizeClass: sizeClassOf(story.articles.length),
    storyArticleCount: story.articles.length,
    articles,
  };
}

/** 저장소에 커밋할 본문 없는 목록. */
export function toDevSet(packets: readonly LocalPacket[], seed: string, pairs: DevPairs): DevSet {
  const actual = Object.fromEntries(
    SIZE_CLASSES.map((size) => [size, packets.filter((p) => p.sizeClass === size).length]),
  ) as Record<SizeClass, number>;
  const byTopic = Object.fromEntries(
    TOPICS.map((topic) => [topic, packets.filter((p) => p.topic === topic).length]),
  );
  return {
    seed,
    composition: { target: SIZE_TARGETS, actual, byTopic },
    packets: packets.map((p) => ({
      packetId: p.packetId,
      topic: p.topic,
      sizeClass: p.sizeClass,
      storyArticleCount: p.storyArticleCount,
      articles: p.articles.map((a) => ({
        key: a.key,
        url: a.url,
        normalizedUrlHash: sha256Hex(a.normalizedUrl),
        sourceId: a.sourceId,
        publishedAt: a.publishedAt,
        bodyHash: sha256Hex(a.body),
        codePointLength: spanLength(a.body),
        sentenceCount: splitSentences(a.body).length,
      })),
    })),
    pairs,
  };
}

/** 검사하는 부분 문자열 길이(코드 포인트가 아니라 UTF-16 — 검사는 보수적일수록 좋다). */
export const LEAK_WINDOW = 20;

/**
 * 저장소에 쓸 문자열에 패킷 기사의 본문·제목·설명의 20자 이상 부분 문자열이 있으면 던진다.
 * 기사 텍스트의 모든 20자 창을 집합으로 만들고 출력의 20자 창을 찾는다(20자 이상 겹침 ⇔ 20자 창 하나가 같다).
 */
export function assertNoArticleText(output: string, packets: readonly LocalPacket[]): void {
  const windows = new Set<string>();
  for (const packet of packets) {
    for (const article of packet.articles) {
      for (const text of [article.body, article.title, article.description ?? ""]) {
        for (let i = 0; i + LEAK_WINDOW <= text.length; i += 1) {
          windows.add(text.slice(i, i + LEAK_WINDOW));
        }
      }
    }
  }
  for (let i = 0; i + LEAK_WINDOW <= output.length; i += 1) {
    const window = output.slice(i, i + LEAK_WINDOW);
    if (windows.has(window)) {
      throw new Error(`저장소 산출물에 기사 텍스트가 들어 있다: 위치 ${i}`);
    }
  }
}
