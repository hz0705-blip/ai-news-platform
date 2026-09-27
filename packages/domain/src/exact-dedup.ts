import { type ArticleVersion, createArticleVersion } from "./article-version.ts";
import type { CollectedArticle } from "./collected-article.ts";
import { sha256Hex } from "./hash.ts";
import { normalizeTitle } from "./text.ts";
import { TOPICS, type Topic } from "./topic.ts";
import { normalizeArticleUrl } from "./url.ts";

/** 저장소가 이미 아는 기사 하나. `latestBodyHash`는 마지막 기사 버전의 본문 해시다(버전이 없으면 undefined). */
export interface KnownArticle {
  readonly id: string;
  readonly sourceId: string;
  readonly normalizedUrl: string;
  readonly normalizedTitle: string;
  readonly topics: readonly Topic[];
  readonly latestBodyHash: string | undefined;
}

/** 정확 중복 제거를 거친 기사 하나: 저장할 기사 행(신규 또는 토픽 합집합 갱신)과 새 기사 버전들. */
export interface DedupedArticle {
  readonly id: string;
  readonly isNew: boolean;
  readonly sourceId: string;
  readonly externalId: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly title: string;
  readonly description: string;
  readonly publishedAt: Date;
  readonly topics: readonly Topic[];
  /** 본문 해시가 마지막 버전과 다를 때만 생긴다(원문 변경 후보). 같은 배치에서 여러 번 바뀌면 순서대로. */
  readonly newVersions: readonly ArticleVersion[];
}

export interface ExactDedupInput {
  readonly known: readonly KnownArticle[];
  readonly collected: readonly CollectedArticle[];
  readonly capturedAt: Date;
}

/** 기사 식별자: 정규화 URL의 해시. 같은 키는 같은 기사다. */
export function articleIdFor(normalizedUrl: string): string {
  return `a-${sha256Hex(normalizedUrl).slice(0, 16)}`;
}

/** 기사 버전 식별자: 기사 식별자 + 본문 해시. 같은 본문의 재수집은 같은 식별자라 다시 저장되지 않는다. */
export function articleVersionIdFor(articleId: string, bodyHash: string): string {
  return `av-${sha256Hex(`${articleId}\n${bodyHash}`).slice(0, 16)}`;
}

function unionTopics(a: readonly Topic[], b: readonly Topic[]): readonly Topic[] {
  const set = new Set<Topic>([...a, ...b]);
  return TOPICS.filter((topic) => set.has(topic));
}

function mergeKey(sourceId: string, normalizedTitle: string, bodyHash: string): string {
  return `${sourceId}\n${normalizedTitle}\n${bodyHash}`;
}

/**
 * 정확 중복 제거(docs/spec/v1.md "파이프라인", "개발 중 결정 항목" 정확 중복 제거). 순수 함수.
 *
 * 수집한 기사를 받은 순서로 처리한다:
 * 1. 정규화 URL이 같은 기사가 있으면 같은 기사다.
 * 2. 없어도 같은 출처이고 정규화 제목과 정규화 본문 해시가 모두 같은 기사가 있으면 같은 기사로 합친다.
 * 3. 둘 다 아니면 새 기사다.
 * 같은 기사에 대해 토픽은 합집합이고, 본문 해시가 마지막 버전과 다르면 새 기사 버전을 만든다.
 * 다른 출처의 같은 본문(전재)은 합치지 않는다. 결과는 기사마다 한 항목이다.
 */
export function dedupeExact(input: ExactDedupInput): readonly DedupedArticle[] {
  const results: DedupedArticle[] = [];
  const byId = new Map<string, number>();
  const byUrl = new Map<string, string>();
  const byMerge = new Map<string, string>();
  const latestHash = new Map<string, string | undefined>();

  for (const article of input.known) {
    byUrl.set(article.normalizedUrl, article.id);
    latestHash.set(article.id, article.latestBodyHash);
    if (article.latestBodyHash !== undefined) {
      byMerge.set(
        mergeKey(article.sourceId, article.normalizedTitle, article.latestBodyHash),
        article.id,
      );
    }
  }
  const knownById = new Map(input.known.map((article) => [article.id, article]));

  for (const item of input.collected) {
    const normalizedUrl = normalizeArticleUrl(item.url);
    const normalizedTitle = normalizeTitle(item.title);
    // 해시는 정규화 본문 기준이다. 버전 식별자는 기사 식별자를 알아야 하므로 먼저 해시만 구한다.
    const probe = createArticleVersion({
      id: "",
      articleId: "",
      rawBody: item.rawBody,
      capturedAt: input.capturedAt,
    });
    const bodyHash = probe.bodyHash;

    const id =
      byUrl.get(normalizedUrl) ??
      byMerge.get(mergeKey(item.sourceId, normalizedTitle, bodyHash)) ??
      articleIdFor(normalizedUrl);

    const index = byId.get(id);
    const existing = index === undefined ? undefined : results[index];
    const known = knownById.get(id);
    const base: DedupedArticle = existing ?? {
      id,
      isNew: known === undefined,
      sourceId: known?.sourceId ?? item.sourceId,
      externalId: item.externalId,
      url: item.url,
      normalizedUrl: known?.normalizedUrl ?? normalizedUrl,
      title: item.title,
      description: item.description,
      publishedAt: item.publishedAt,
      topics: known?.topics ?? [],
      newVersions: [],
    };

    const newVersions =
      latestHash.get(id) === bodyHash
        ? base.newVersions
        : [
            ...base.newVersions,
            {
              ...probe,
              id: articleVersionIdFor(id, bodyHash),
              articleId: id,
            },
          ];
    latestHash.set(id, bodyHash);

    const merged: DedupedArticle = {
      ...base,
      topics: unionTopics(base.topics, item.topics),
      newVersions,
    };
    if (index === undefined) {
      byId.set(id, results.length);
      results.push(merged);
    } else {
      results[index] = merged;
    }
    byUrl.set(normalizedUrl, id);
    byMerge.set(mergeKey(base.sourceId, normalizedTitle, bodyHash), id);
  }

  return results;
}
