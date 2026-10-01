import type { LeadImage, StoryPageData } from "@newstrail/db";
import {
  CHANGE_KINDS,
  type ChangeKind,
  CONTRADICTION_STATUSES,
  type ContradictionStatus,
  canDisplayExcerpt,
  countClaimStatuses,
  type RightsTier,
  type Topic,
  toUtf16Range,
} from "@newstrail/domain";

/** 근거 행의 공통 필드. 기사 본문은 없다. */
export interface EvidenceViewBase {
  readonly sourceName: string;
  readonly isFictional: boolean;
  readonly articleTitle: string;
  readonly publishedAt: Date;
  readonly sourceUrl: string;
  /** 같은 주장의 다른 근거와 다른 점. 양립 불가 쌍의 근거에만 있다. */
  readonly differsIn?: string;
}

/**
 * 근거 행 하나. `발췌`는 허용 발췌와 그 안의 UTF-16 강조 범위를 가진다.
 * `발췌 불가`는 출처의 현재 권리 등급으로 구간을 보일 수 없는 근거이며 구간 텍스트를 싣지 않는다
 * (스펙 "근거 발췌를 표시할 수 없음", ADR-0002 하향 즉시 반영). 상충 상태가 아니다.
 */
export type EvidenceView =
  | (EvidenceViewBase & {
      readonly display: "발췌";
      readonly excerpt: string;
      readonly highlight: { readonly start: number; readonly end: number };
    })
  | (EvidenceViewBase & { readonly display: "발췌 불가" });

export interface ClaimView {
  readonly id: string;
  /** 화면에 보이는 주장 번호(1부터). 저장된 순서(0부터)에 1을 더한다. */
  readonly order: number;
  readonly text: string;
  readonly status: ContradictionStatus;
  /** 보도 상충 주장이면 참. 근거 행을 비교 행(순서·다른 점)으로 그린다. */
  readonly isComparison: boolean;
  /** 발행 시각 오름차순, 같으면 출처명 순. */
  readonly evidence: readonly EvidenceView[];
}

/** 상태 하나의 주장 개수와 그 주장들의 화면 번호(1부터). */
export interface StatusCountView {
  readonly status: ContradictionStatus;
  readonly count: number;
  readonly claimOrders: readonly number[];
}

interface SourceViewBase {
  readonly id: string;
  /** 출처 표의 이름. 표에 없는 GDELT 출처는 도메인이다(#77이 출처를 만들 때 이름 = 도메인). */
  readonly name: string;
  readonly isFictional: boolean;
  readonly rightsTier: RightsTier;
  /** 출처의 현재 권리 등급으로 근거 발췌를 보일 수 있는지(`canDisplayExcerpt`). 거짓이면 행이 그 사실을 글로 밝힌다. */
  readonly excerptAvailable: boolean;
  readonly region: string;
  readonly ownership: string;
  readonly language: string;
  readonly articleTitle: string;
  readonly articleUrl: string;
}

/**
 * 출처 구획의 행 하나. 링크만 기사(GDELT, #77)는 발행 시각을 모르므로 관측 시각(GKG `DATE`)만 가진다
 * (스펙 "데이터 소스와 권리" GDELT).
 */
export type SourceView =
  | (SourceViewBase & { readonly isLinkOnly: false; readonly publishedAt: Date })
  | (SourceViewBase & { readonly isLinkOnly: true; readonly observedAt: Date });

/** 단어 차이의 한 조각. `changed`는 이전 문장에서는 지운 단어, 현재 문장에서는 넣은 단어다. */
export interface WordDiffSegment {
  readonly text: string;
  readonly changed: boolean;
}

/** 변화 구획의 기사 참조. 사건의 기사 목록에서 찾지 못하면 없다. */
export interface ChangeArticleView {
  readonly sourceName: string;
  readonly articleTitle: string;
  readonly articleUrl: string;
}

/**
 * 변화 구획의 항목 하나. 주장 변화·상태 변화·원문 변경은 항목별로 보이고, 출처 추가는 개수(`sourceAdditionCount`)로만 센다.
 * `claimOrder`는 이 개정판에서 그 주장의 화면 번호다(삭제된 주장에는 없다).
 */
export type ChangeItemView =
  | { readonly type: "주장 추가"; readonly claimOrder?: number; readonly currentText: string }
  | { readonly type: "주장 삭제"; readonly previousText: string }
  | {
      readonly type: "주장 수정";
      readonly claimOrder?: number;
      readonly previous: readonly WordDiffSegment[];
      readonly current: readonly WordDiffSegment[];
    }
  | {
      readonly type: "상충 상태 변화";
      /** 없으면 사건 상태의 변화다. */
      readonly claimOrder?: number;
      readonly previousStatus: ContradictionStatus;
      readonly currentStatus: ContradictionStatus;
    }
  | { readonly type: "원문 변경"; readonly article?: ChangeArticleView };

/** 개정판 띠의 항목 하나(개정판 번호 오름차순). */
export interface RevisionStripItemView {
  readonly id: string;
  readonly revisionNumber: number;
  /** 개정판 고정 URL. */
  readonly href: string;
  readonly publishedAt: Date;
  /** 지금 화면이 보이는 개정판(보는 중)이면 참. */
  readonly isViewing: boolean;
  /** 최신 발행 개정판이면 참. */
  readonly isLatest: boolean;
  /** 변화 종류별 개수(`CHANGE_KINDS` 순서, 0 포함). */
  readonly counts: readonly { readonly kind: ChangeKind; readonly count: number }[];
}

/** 보도량 추이의 구간 하나. `start`는 KST 경계에 맞춘 구간 시작 시각이다. */
export interface CoverageBinView {
  readonly start: Date;
  readonly end: Date;
  readonly count: number;
  /** 발행 시각을 몰라 관측 시각으로 센 기사 수(`count`에 포함). */
  readonly observedCount: number;
}

export interface CoverageView {
  /** 구간 크기(스펙 "개발 중 결정 항목" 보도량 추이의 구간 크기). */
  readonly binSize: "6시간" | "1일";
  readonly bins: readonly CoverageBinView[];
  readonly observedTotal: number;
}

export interface StoryView {
  readonly slug: string;
  /** 이 화면이 보이는 개정판. 방문 기록(마지막으로 본 개정판)이 이것을 넘긴다. */
  readonly revisionId: string;
  /** 사건 URL(최신 개정판). */
  readonly storyHref: string;
  /** 이 화면의 개정판이 최신 발행 개정판이면 참. 거짓이면 화면이 이전 개정판 안내를 보인다. */
  readonly isLatestRevision: boolean;
  readonly header: {
    readonly title: string;
    readonly topics: readonly Topic[];
    readonly isDemo: boolean;
    readonly status: ContradictionStatus;
    readonly sourceCount: number;
    readonly updatedAt: Date;
    /** 개수가 0인 상태는 뺀다. 상태 순서는 `CONTRADICTION_STATUSES`. */
    readonly statusCounts: readonly StatusCountView[];
    /** 대표 이미지(`{ url, sourceName, articleUrl }`). 없으면 null — 화면은 슬롯을 두지 않는다. */
    readonly image: LeadImage | null;
  };
  readonly claims: readonly ClaimView[];
  readonly sources: readonly SourceView[];
  /** 이 개정판과 직전 개정판 사이 변화. 첫 개정판은 항목이 없다. */
  readonly changes: {
    readonly revisionNumber: number;
    readonly items: readonly ChangeItemView[];
    /** 출처 추가는 접어서 개수만 보인다. */
    readonly sourceAdditionCount: number;
  };
  readonly revisions: readonly RevisionStripItemView[];
  /** 기사가 없으면 undefined. */
  readonly coverage: CoverageView | undefined;
}

/** 사건 URL. */
export const storyHref = (slug: string): string => `/story/${encodeURIComponent(slug)}`;

/** 개정판 고정 URL. 개정판 식별자의 `:`는 인코딩한다(라우트가 한 번 디코딩한다). */
export const revisionHref = (slug: string, revisionId: string): string =>
  `/story/${encodeURIComponent(slug)}/revision/${encodeURIComponent(revisionId)}`;

/**
 * 공백으로 가른 단어의 최장 공통 부분열(LCS)로 이전·현재 문장의 단어 차이를 낸다. 표시용이며 변화 여부는
 * 주장 매칭이 정한다(스펙 "변화 구획"). 이웃한 같은 종류의 단어는 한 조각으로 합친다.
 */
export function diffWords(
  previous: string,
  current: string,
): { previous: WordDiffSegment[]; current: WordDiffSegment[] } {
  const a = previous.split(/\s+/).filter((w) => w !== "");
  const b = current.split(/\s+/).filter((w) => w !== "");
  // lcs[i * (b.length + 1) + j] = a[i..]와 b[j..]의 LCS 길이
  const cols = b.length + 1;
  const lcs = new Array<number>((a.length + 1) * cols).fill(0);
  const at = (i: number, j: number): number => lcs[i * cols + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const prev: { text: string; changed: boolean }[] = [];
  const curr: { text: string; changed: boolean }[] = [];
  const push = (out: typeof prev, text: string, changed: boolean) => {
    const last = out.at(-1);
    if (last !== undefined && last.changed === changed) last.text = `${last.text} ${text}`;
    else out.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const wa = a[i];
    const wb = b[j];
    if (wa !== undefined && wa === wb) {
      push(prev, wa, false);
      push(curr, wa, false);
      i += 1;
      j += 1;
    } else if (wa !== undefined && (wb === undefined || at(i + 1, j) >= at(i, j + 1))) {
      push(prev, wa, true);
      i += 1;
    } else if (wb !== undefined) {
      push(curr, wb, true);
      j += 1;
    }
  }
  return { previous: prev, current: curr };
}

const HOUR = 3_600_000;
const KST_OFFSET = 9 * HOUR;
/** 사건 기간이 이 길이 이하면 6시간 구간, 넘으면 1일 구간(스펙 "개발 중 결정 항목"). */
const SIX_HOUR_LIMIT = 72 * HOUR;

/**
 * 보도량 추이. 개정판의 출처 집합에 든 기사만 받는다. 기사마다 발행 시각으로 세고, 발행 시각을 모르는 링크만 기사는 관측 시각으로 센다.
 * 기간은 첫 기사부터 max(마지막 기사, 개정판 발행)까지, 구간 경계는 KST 자정·6시간이며 빈 구간은 0이다.
 */
export function buildCoverage(
  articles: readonly { readonly at: Date; readonly observed: boolean }[],
  revisionPublishedAt: Date,
): CoverageView | undefined {
  if (articles.length === 0) return undefined;
  const times = articles.map((a) => a.at.getTime());
  const first = Math.min(...times);
  const last = Math.max(...times, revisionPublishedAt.getTime());
  const binSize = last - first <= SIX_HOUR_LIMIT ? "6시간" : "1일";
  const width = binSize === "6시간" ? 6 * HOUR : 24 * HOUR;
  const floor = (t: number) => Math.floor((t + KST_OFFSET) / width) * width - KST_OFFSET;
  const bins: { start: Date; end: Date; count: number; observedCount: number }[] = [];
  for (let start = floor(first); start <= floor(last); start += width) {
    bins.push({ start: new Date(start), end: new Date(start + width), count: 0, observedCount: 0 });
  }
  for (const article of articles) {
    const bin = bins[(floor(article.at.getTime()) - floor(first)) / width];
    if (bin === undefined) continue;
    bin.count += 1;
    if (article.observed) bin.observedCount += 1;
  }
  return { binSize, bins, observedTotal: articles.filter((a) => a.observed).length };
}

/** 사건 화면이 읽는 유일한 모델. 질의 결과에서 화면에 필요한 값만 골라 옮긴다. */
export function buildStoryView(data: StoryPageData): StoryView {
  const sourceById = new Map(data.sources.map((s) => [s.id, s]));
  const counts = countClaimStatuses(data.claims);
  const statusCounts = CONTRADICTION_STATUSES.filter((status) => counts[status] > 0).map(
    (status) => ({
      status,
      count: counts[status],
      claimOrders: data.claims
        .filter((claim) => claim.contradictionStatus === status)
        .map((claim) => claim.order + 1)
        .sort((a, b) => a - b),
    }),
  );
  const claimOrderOf = new Map(data.claims.map((claim) => [claim.id, claim.order + 1]));
  const orderField = (claimId: string | undefined) => {
    const order = claimId === undefined ? undefined : claimOrderOf.get(claimId);
    return order === undefined ? {} : { claimOrder: order };
  };
  const articleOf = new Map(
    data.sources.map((s) => [
      s.articleId,
      { sourceName: s.name, articleTitle: s.articleTitle, articleUrl: s.articleUrl },
    ]),
  );
  const items: ChangeItemView[] = [];
  let sourceAdditionCount = 0;
  for (const change of data.changes) {
    switch (change.kind) {
      case "주장 추가·삭제·수정":
        if (change.claimChange === "추가") {
          items.push({
            type: "주장 추가",
            ...orderField(change.claimId),
            currentText: change.currentText,
          });
        } else if (change.claimChange === "삭제") {
          items.push({ type: "주장 삭제", previousText: change.previousText });
        } else {
          items.push({
            type: "주장 수정",
            ...orderField(change.claimId),
            ...diffWords(change.previousText, change.currentText),
          });
        }
        break;
      case "상충 상태 변화":
        items.push({
          type: "상충 상태 변화",
          ...orderField(change.claimId),
          previousStatus: change.previousStatus,
          currentStatus: change.currentStatus,
        });
        break;
      case "원문 변경": {
        const article = articleOf.get(change.articleId);
        items.push({ type: "원문 변경", ...(article === undefined ? {} : { article }) });
        break;
      }
      case "출처 추가":
        sourceAdditionCount += 1;
        break;
    }
  }
  // 최신은 띠에 실린 개정판 중 번호가 가장 큰 것이다. 띠는 이 개정판까지만 실으므로(`StoryPageData.revisions`)
  // 이전 개정판 화면은 라우트가 최신 포인터와 비교해 `asOlderRevision`으로 바꾼다.
  const latestNumber = Math.max(...data.revisions.map((r) => r.revisionNumber));
  return {
    slug: data.story.slug,
    revisionId: data.revision.id,
    storyHref: storyHref(data.story.slug),
    isLatestRevision: data.revision.revisionNumber >= latestNumber,
    header: {
      title: data.revision.title,
      topics: data.story.topics,
      isDemo: data.story.isDemo,
      status: data.revision.contradictionStatus,
      sourceCount: data.sources.length,
      updatedAt: data.revision.publishedAt,
      statusCounts,
      image: data.image,
    },
    claims: [...data.claims]
      .sort((a, b) => a.order - b.order)
      .map((claim) => ({
        id: claim.id,
        order: claim.order + 1,
        text: claim.text,
        status: claim.contradictionStatus,
        isComparison: claim.contradictionStatus === "보도 상충",
        evidence: claim.evidence
          .map((item): EvidenceView => {
            const source = sourceById.get(item.sourceId);
            if (source === undefined)
              throw new Error(`근거의 출처를 찾지 못했다: ${item.sourceId}`);
            const base: EvidenceViewBase = {
              sourceName: source.name,
              isFictional: source.isFictional,
              articleTitle: item.articleTitle,
              publishedAt: item.publishedAt,
              sourceUrl: item.sourceUrl,
              ...(item.differsIn === undefined ? {} : { differsIn: item.differsIn }),
            };
            if (!canDisplayExcerpt(source.rightsTier)) return { ...base, display: "발췌 불가" };
            const { start, end } = toUtf16Range(item.excerpt, item.highlightInExcerpt);
            return { ...base, display: "발췌", excerpt: item.excerpt, highlight: { start, end } };
          })
          .sort(
            (a, b) =>
              a.publishedAt.getTime() - b.publishedAt.getTime() ||
              a.sourceName.localeCompare(b.sourceName, "ko"),
          ),
      })),
    sources: data.sources.map((s): SourceView => {
      const base: SourceViewBase = {
        id: s.id,
        name: s.name,
        isFictional: s.isFictional,
        rightsTier: s.rightsTier,
        excerptAvailable: canDisplayExcerpt(s.rightsTier),
        region: s.region,
        ownership: s.ownership,
        language: s.language,
        articleTitle: s.articleTitle,
        articleUrl: s.articleUrl,
      };
      // 링크만 기사의 `publishedAt`은 관측 시각의 복사본이다(#77) — 관측 시각이 비어 있을 때만 그것을 쓴다.
      return s.isLinkOnly
        ? { ...base, isLinkOnly: true, observedAt: s.observedAt ?? s.publishedAt }
        : { ...base, isLinkOnly: false, publishedAt: s.publishedAt };
    }),
    changes: { revisionNumber: data.revision.revisionNumber, items, sourceAdditionCount },
    revisions: data.revisions.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      href: revisionHref(data.story.slug, r.id),
      publishedAt: r.publishedAt,
      isViewing: r.id === data.revision.id,
      isLatest: r.revisionNumber === latestNumber,
      counts: CHANGE_KINDS.map((kind) => ({ kind, count: r.changeCounts[kind] })),
    })),
    coverage: buildCoverage(
      data.coverageArticles.map((s) => ({
        at: s.isLinkOnly ? (s.observedAt ?? s.publishedAt) : s.publishedAt,
        observed: s.isLinkOnly,
      })),
      data.revision.publishedAt,
    ),
  };
}

/**
 * 최신이 아닌 개정판의 화면 모델. 개정판 화면 캐시는 불변이고 띠는 그 개정판까지만 실으므로, 최신 발행 개정판
 * 포인터와 다른 고정 URL에서 라우트가 부른다. 띠에 최신 개정판이 없으니 `최신` 표기도 없앤다.
 */
export const asOlderRevision = (view: StoryView): StoryView => ({
  ...view,
  isLatestRevision: false,
  revisions: view.revisions.map((r) => ({ ...r, isLatest: false })),
});
