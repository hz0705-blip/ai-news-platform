import type {
  ArticleVersion,
  DormantRecheckSlot,
  GnewsLedgerDay,
  RecheckCandidate,
  RecheckSlot,
} from "@newstrail/domain";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { toArticleVersionRow } from "./mappers.ts";
import type { RuntimeDb } from "./runtime.ts";
import {
  articleRechecks,
  articles,
  articleVersions,
  gnewsRequestLedger,
  stories,
} from "./schema/index.ts";

/** 그 UTC 날짜의 원장 행. 없으면 0으로 시작한다. */
export async function loadGnewsLedgerDay(
  db: RuntimeDb["db"],
  utcDate: string,
): Promise<GnewsLedgerDay> {
  const [row] = await db
    .select()
    .from(gnewsRequestLedger)
    .where(eq(gnewsRequestLedger.utc_date, utcDate));
  return { utcDate, discovery: row?.discovery ?? 0, recheck: row?.recheck ?? 0 };
}

/** 원장에 실제로 보낸 요청 수를 더한다(행이 없으면 만든다). 발견 = 정규 수집, 재수집 = 원문 재수집 조회. */
export async function addGnewsRequests(
  db: RuntimeDb["db"],
  input: {
    readonly utcDate: string;
    readonly purpose: "discovery" | "recheck";
    readonly count: number;
  },
): Promise<void> {
  if (input.count <= 0) return;
  const column = gnewsRequestLedger[input.purpose];
  await db
    .insert(gnewsRequestLedger)
    .values({ utc_date: input.utcDate, [input.purpose]: input.count })
    .onConflictDoUpdate({
      target: gnewsRequestLedger.utc_date,
      set: { [input.purpose]: sql`${column} + ${input.count}` },
    });
}

/**
 * 재수집 일정 후보(#86): 라이브 사건에 붙은 본문 있는 기사 중 본문 보존 기한이 남은 것. 종료·데모 사건과
 * 링크만 기사는 여기서 빼고, 활성·휴면·일정 판단은 도메인(`planRechecks`)이 한다.
 * 수집 시각은 첫 기사 버전의 `captured_at`, 보존 기한은 마지막 버전의 `body_expires_at`이다.
 */
export async function loadRecheckCandidates(
  db: RuntimeDb["db"],
  now: Date,
): Promise<RecheckCandidate[]> {
  const rows = await db
    .select({
      articleId: articles.id,
      isLinkOnly: articles.is_link_only,
      lifecycle: stories.lifecycle,
      isDemo: stories.is_demo,
      lastNewReportAt: stories.last_new_report_at,
      collectedAt:
        sql<Date>`(select min(${articleVersions.captured_at}) from ${articleVersions} where ${articleVersions.article_id} = ${articles.id})`.mapWith(
          (v: string | Date) => new Date(v),
        ),
      bodyExpiresAt:
        sql<Date>`(select ${articleVersions.body_expires_at} from ${articleVersions} where ${articleVersions.article_id} = ${articles.id} order by ${articleVersions.captured_at} desc limit 1)`.mapWith(
          (v: string | Date) => new Date(v),
        ),
      done: sql<
        RecheckSlot[]
      >`coalesce((select array_agg(${articleRechecks.slot}) from ${articleRechecks} where ${articleRechecks.article_id} = ${articles.id}), '{}')`,
    })
    .from(articles)
    .innerJoin(stories, eq(stories.id, articles.story_id))
    .where(
      and(
        eq(stories.is_demo, false),
        sql`${stories.lifecycle} <> '종료'`,
        eq(articles.is_link_only, false),
        sql`exists (select 1 from ${articleVersions} where ${articleVersions.article_id} = ${articles.id} and ${articleVersions.body_expires_at} > ${now.toISOString()}::timestamptz)`,
      ),
    )
    .orderBy(articles.id);
  return rows.map((row) => ({
    articleId: row.articleId,
    collectedAt: row.collectedAt,
    bodyExpiresAt: row.bodyExpiresAt,
    isLinkOnly: row.isLinkOnly,
    story: {
      lifecycle: row.lifecycle,
      isDemo: row.isDemo,
      lastNewReportAt: row.lastNewReportAt ?? undefined,
    },
    done: row.done,
  }));
}

/** 그 UTC 날짜에 휴면 나이대별로 이미 재수집한 수(하루 40건 상한 계산용). */
export async function loadDormantSampledToday(
  db: RuntimeDb["db"],
  utcDate: string,
): Promise<Partial<Record<DormantRecheckSlot, number>>> {
  const from = new Date(`${utcDate}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ slot: articleRechecks.slot, count: sql<number>`count(*)`.mapWith(Number) })
    .from(articleRechecks)
    .where(
      and(
        inArray(articleRechecks.slot, ["7d", "14d", "28d"]),
        gte(articleRechecks.checked_at, from),
        lt(articleRechecks.checked_at, to),
      ),
    )
    .groupBy(articleRechecks.slot);
  const counts: Partial<Record<DormantRecheckSlot, number>> = {};
  for (const row of rows) {
    if (row.slot === "7d" || row.slot === "14d" || row.slot === "28d") counts[row.slot] = row.count;
  }
  return counts;
}

/** 재수집 조회 대상: 기사 제목·URL·발행 시각과 마지막 기사 버전(본문·해시). 마지막 버전의 본문을 지운 기사는 빠진다. */
export interface RecheckTargetRow {
  readonly articleId: string;
  readonly storyId: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: Date;
  readonly latest: { readonly id: string; readonly body: string; readonly bodyHash: string };
}

export async function loadRecheckTargets(
  db: RuntimeDb["db"],
  articleIds: readonly string[],
): Promise<RecheckTargetRow[]> {
  if (articleIds.length === 0) return [];
  const rows = await db
    .select({
      articleId: articles.id,
      storyId: articles.story_id,
      title: articles.title,
      url: articles.url,
      publishedAt: articles.published_at,
    })
    .from(articles)
    .where(inArray(articles.id, [...articleIds]));
  const latest = await db
    .selectDistinctOn([articleVersions.article_id], {
      article_id: articleVersions.article_id,
      id: articleVersions.id,
      body: articleVersions.body,
      body_hash: articleVersions.body_hash,
    })
    .from(articleVersions)
    .where(inArray(articleVersions.article_id, [...articleIds]))
    .orderBy(articleVersions.article_id, desc(articleVersions.captured_at));
  const latestById = new Map(latest.map((v) => [v.article_id, v]));
  const result: RecheckTargetRow[] = [];
  for (const row of rows) {
    const version = latestById.get(row.articleId);
    // 본문을 지운 버전(보존 기한, #144)은 비교할 본문이 없으므로 재수집하지 않는다.
    if (version === undefined || version.body === null || row.storyId === null) continue;
    result.push({
      articleId: row.articleId,
      storyId: row.storyId,
      title: row.title,
      url: row.url,
      publishedAt: row.publishedAt,
      latest: { id: version.id, body: version.body, bodyHash: version.body_hash },
    });
  }
  return result;
}

export interface SaveRecheckInput {
  readonly articleId: string;
  readonly storyId: string;
  readonly slot: RecheckSlot;
  readonly checkedAt: Date;
  readonly outcome: "찾음" | "미확인";
  /** 찾았고 정규화 본문 해시가 달랐을 때의 새 기사 버전과 정정 후보 여부. */
  readonly newVersion?: {
    readonly version: ArticleVersion;
    readonly publishedAt: Date;
    readonly correctionCandidate: boolean;
  };
}

/**
 * 재수집 결과 하나를 한 트랜잭션에 쓴다(#86): 일정 기록, 새 기사 버전(있으면), 그 사건을 재처리 대상으로 올리기
 * (`last_processed_at` = 재수집 시각 — 휴면 사건 포함, 마지막 신규 보도 시계는 건드리지 않는다).
 * 같은 기사·같은 일정은 한 번만 기록되고, 이미 있던 본문(A→B→A)의 버전은 다시 쓰지 않는다.
 * 새 버전이 실제로 들어갔으면 참.
 */
export async function saveRecheckResult(
  db: RuntimeDb["db"],
  input: SaveRecheckInput,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    let inserted = false;
    if (input.newVersion !== undefined) {
      const { version, publishedAt, correctionCandidate } = input.newVersion;
      const rows = await tx
        .insert(articleVersions)
        .values({
          ...toArticleVersionRow(version, {
            id: input.articleId,
            sourceId: "",
            storyId: input.storyId,
            url: "",
            title: "",
            publishedAt,
            topics: [],
          }),
          correction_candidate: correctionCandidate,
        })
        .onConflictDoNothing()
        .returning({ id: articleVersions.id });
      inserted = rows.length > 0;
      if (inserted) {
        await tx
          .update(stories)
          .set({ last_processed_at: input.checkedAt })
          .where(eq(stories.id, input.storyId));
      }
    }
    await tx
      .insert(articleRechecks)
      .values({
        article_id: input.articleId,
        slot: input.slot,
        checked_at: input.checkedAt,
        outcome: input.outcome,
        article_version_id: inserted ? (input.newVersion?.version.id ?? null) : null,
      })
      .onConflictDoNothing();
    return inserted;
  });
}
