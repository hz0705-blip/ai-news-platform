import type { StoryPageData } from "@newsplatform/db";
import {
  type ContradictionStatus,
  type RightsTier,
  type Topic,
  toUtf16Range,
} from "@newsplatform/domain";

/** 근거 행 하나. 허용 발췌와 그 발췌 안의 UTF-16 강조 범위만 가진다 — 기사 본문은 없다. */
export interface EvidenceView {
  readonly sourceName: string;
  readonly isFictional: boolean;
  readonly articleTitle: string;
  readonly publishedAt: Date;
  readonly excerpt: string;
  readonly highlight: { readonly start: number; readonly end: number };
  readonly sourceUrl: string;
}

export interface ClaimView {
  readonly id: string;
  /** 화면에 보이는 주장 번호(1부터). 저장된 순서(0부터)에 1을 더한다. */
  readonly order: number;
  readonly text: string;
  readonly status: ContradictionStatus;
  readonly evidence: readonly EvidenceView[];
}

export interface SourceView {
  readonly id: string;
  readonly name: string;
  readonly isFictional: boolean;
  readonly rightsTier: RightsTier;
  readonly region: string;
  readonly ownership: string;
  readonly language: string;
  readonly articleTitle: string;
  readonly articleUrl: string;
  readonly publishedAt: Date;
}

export interface StoryView {
  readonly header: {
    readonly title: string;
    readonly topics: readonly Topic[];
    readonly isDemo: boolean;
    readonly status: ContradictionStatus;
    readonly sourceCount: number;
    readonly updatedAt: Date;
  };
  readonly claims: readonly ClaimView[];
  readonly sources: readonly SourceView[];
  /** 개정판 사이 변화. 첫 개정판뿐인 이 단계에서는 항상 비어 있다. */
  readonly changes: readonly [];
}

/** 사건 화면이 읽는 유일한 모델. 질의 결과에서 화면에 필요한 값만 골라 옮긴다. */
export function buildStoryView(data: StoryPageData): StoryView {
  const sourceById = new Map(data.sources.map((s) => [s.id, s]));
  return {
    header: {
      title: data.story.title,
      topics: data.story.topics,
      isDemo: data.story.isDemo,
      status: data.revision.contradictionStatus,
      sourceCount: data.sources.length,
      updatedAt: data.revision.publishedAt,
    },
    claims: [...data.claims]
      .sort((a, b) => a.order - b.order)
      .map((claim) => ({
        id: claim.id,
        order: claim.order + 1,
        text: claim.text,
        status: claim.contradictionStatus,
        evidence: claim.evidence.map((item) => {
          const source = sourceById.get(item.sourceId);
          if (source === undefined) throw new Error(`근거의 출처를 찾지 못했다: ${item.sourceId}`);
          const { start, end } = toUtf16Range(item.excerpt, item.highlightInExcerpt);
          return {
            sourceName: source.name,
            isFictional: source.isFictional,
            articleTitle: item.articleTitle,
            publishedAt: item.publishedAt,
            excerpt: item.excerpt,
            highlight: { start, end },
            sourceUrl: item.sourceUrl,
          };
        }),
      })),
    sources: data.sources.map((s) => ({
      id: s.id,
      name: s.name,
      isFictional: s.isFictional,
      rightsTier: s.rightsTier,
      region: s.region,
      ownership: s.ownership,
      language: s.language,
      articleTitle: s.articleTitle,
      articleUrl: s.articleUrl,
      publishedAt: s.publishedAt,
    })),
    changes: [],
  };
}
