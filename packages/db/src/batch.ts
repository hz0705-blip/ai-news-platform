import type {
  Article,
  Claim,
  DueBatchRun,
  Revision,
  RevisionSource,
  Source,
  Story,
} from "@newsplatform/domain";
import { deriveReprocessContext } from "@newsplatform/domain";
import { slotAtOf } from "@newsplatform/domain/batch-slot";
import { and, desc, eq, gt, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { toDomainSource, toDomainStory } from "./mappers.ts";
import { loadClaimHistory, loadRevision } from "./queries/revision.ts";
import type { RuntimeDb } from "./runtime.ts";
import {
  articles,
  articleVersions,
  type BatchRunRow,
  batchRuns,
  sources,
  stories,
  storyRevisions,
} from "./schema/index.ts";

/** 슬롯 원장 획득을 직렬화하는 트랜잭션 advisory lock 키(#55 Ruling). 테스트 잠금(2106)과 다르다. */
const BATCH_LEASE_LOCK_KEY = 2107;

export type StartBatchRunResult =
  | { readonly kind: "started"; readonly attempt: number }
  | { readonly kind: "already-completed"; readonly finishedAt: Date | null }
  | { readonly kind: "busy"; readonly slotKey: string; readonly leaseExpiresAt: Date };

/**
 * 슬롯 원장에 배치 시작을 기록하고 DB 리스를 잡는다(스펙 "배포와 운영" 스케줄러: 슬롯 원장 + DB 리스로
 * 한 번에 한 배치). 같은 슬롯이 이미 완료됐으면 `already-completed`(멱등), 다른 슬롯의 리스가 살아 있으면
 * `busy`. 실패했거나 리스가 만료된 슬롯은 시도 횟수를 올려 다시 시작한다. 검사와 기록은 advisory lock 아래
 * 한 트랜잭션이라 두 프로세스가 동시에 시작할 수 없다. 모델 호출은 이 트랜잭션 밖에서 한다.
 */
export async function startBatchRun(
  db: RuntimeDb["db"],
  input: {
    readonly slotKey: string;
    readonly slotAt: Date;
    readonly now: Date;
    readonly leaseMs: number;
  },
): Promise<StartBatchRunResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BATCH_LEASE_LOCK_KEY})`);
    const [existing] = await tx
      .select()
      .from(batchRuns)
      .where(eq(batchRuns.slot_key, input.slotKey))
      .limit(1);
    if (existing?.status === "completed") {
      return { kind: "already-completed", finishedAt: existing.finished_at };
    }
    const [running] = await tx
      .select({ slot_key: batchRuns.slot_key, lease_expires_at: batchRuns.lease_expires_at })
      .from(batchRuns)
      .where(
        and(
          eq(batchRuns.status, "running"),
          gt(batchRuns.lease_expires_at, input.now),
          ne(batchRuns.slot_key, input.slotKey),
        ),
      )
      .limit(1);
    if (running?.lease_expires_at) {
      return { kind: "busy", slotKey: running.slot_key, leaseExpiresAt: running.lease_expires_at };
    }
    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs);
    if (existing === undefined) {
      await tx.insert(batchRuns).values({
        slot_key: input.slotKey,
        slot_at: input.slotAt,
        status: "running",
        attempt: 1,
        lease_expires_at: leaseExpiresAt,
        started_at: input.now,
        finished_at: null,
        spend_usd: 0,
        report: null,
        error: null,
      });
      return { kind: "started", attempt: 1 };
    }
    // 같은 슬롯의 이전 시도가 실패했거나(재시도) 리스가 만료된 채 남아 있다(죽은 실행).
    if (
      existing.status === "running" &&
      existing.lease_expires_at &&
      existing.lease_expires_at > input.now
    ) {
      return {
        kind: "busy",
        slotKey: existing.slot_key,
        leaseExpiresAt: existing.lease_expires_at,
      };
    }
    const attempt = existing.attempt + 1;
    await tx
      .update(batchRuns)
      .set({
        status: "running",
        attempt,
        lease_expires_at: leaseExpiresAt,
        started_at: input.now,
        finished_at: null,
        error: null,
      })
      .where(eq(batchRuns.slot_key, input.slotKey));
    return { kind: "started", attempt };
  });
}

/**
 * 지출을 원장에 더한다(증분). 배치는 사건이 끝날 때마다 OpenAI 호출 밖에서 부르므로 실행 중 죽어도
 * 잃는 지출은 진행 중 호출의 예약뿐이고, 같은 슬롯의 재시도는 이전 시도의 지출 위에 쌓인다.
 */
export async function addBatchRunSpend(
  db: RuntimeDb["db"],
  input: { readonly slotKey: string; readonly spendUsd: number },
): Promise<void> {
  if (input.spendUsd <= 0) return;
  await db
    .update(batchRuns)
    .set({ spend_usd: sql`${batchRuns.spend_usd} + ${input.spendUsd}` })
    .where(eq(batchRuns.slot_key, input.slotKey));
}

/** 배치 종료를 원장에 기록하고 리스를 놓는다. 지출은 `addBatchRunSpend`가 이미 쌓았으므로 건드리지 않는다. */
export async function finishBatchRun(
  db: RuntimeDb["db"],
  input: {
    readonly slotKey: string;
    readonly status: "completed" | "failed";
    readonly finishedAt: Date;
    readonly report?: unknown;
    readonly error?: string;
  },
): Promise<void> {
  await db
    .update(batchRuns)
    .set({
      status: input.status,
      lease_expires_at: null,
      finished_at: input.finishedAt,
      report: input.report ?? null,
      error: input.error ?? null,
    })
    .where(eq(batchRuns.slot_key, input.slotKey));
}

/** 마지막으로 완료된 슬롯(수집 `from`의 기준, "직전 성공 수집의 to"). 없으면 `undefined`. */
export async function loadLastCompletedSlot(
  db: RuntimeDb["db"],
): Promise<{ slotKey: string; slotAt: Date } | undefined> {
  const [row] = await db
    .select({ slotKey: batchRuns.slot_key, slotAt: batchRuns.slot_at })
    .from(batchRuns)
    .where(eq(batchRuns.status, "completed"))
    .orderBy(desc(batchRuns.slot_at))
    .limit(1);
  return row;
}

/**
 * 오늘 화면 배치 상태의 입력(#56): 기한 슬롯 이전(포함) 슬롯 시각이 가장 늦은 원장 행. 상한 도달·미룬 수는
 * 완료 행의 리포트(`spend.budgetReached`, `deferred`)에서 읽는다. 원장이 비었으면 `undefined`.
 */
export async function loadDueBatchRun(
  db: RuntimeDb["db"],
  input: { readonly dueSlotKey: string },
): Promise<DueBatchRun | undefined> {
  const dueSlotAt = slotAtOf(input.dueSlotKey);
  if (dueSlotAt === undefined) throw new Error(`슬롯 키가 아니다: ${input.dueSlotKey}`);
  const [row] = await db
    .select({
      slotKey: batchRuns.slot_key,
      status: batchRuns.status,
      leaseExpiresAt: batchRuns.lease_expires_at,
      budgetReached: sql<boolean>`coalesce((${batchRuns.report} -> 'spend' ->> 'budgetReached')::boolean, false)`,
      deferred: sql<number>`coalesce((${batchRuns.report} ->> 'deferred')::int, 0)`,
    })
    .from(batchRuns)
    .where(lte(batchRuns.slot_at, dueSlotAt))
    .orderBy(desc(batchRuns.slot_at))
    .limit(1);
  return row;
}

/** 슬롯 시각이 `since` 이후인 원장 행(누락 슬롯 회복용). */
export async function loadBatchRunsSince(
  db: RuntimeDb["db"],
  since: Date,
): Promise<readonly BatchRunRow[]> {
  return db.select().from(batchRuns).where(gte(batchRuns.slot_at, since));
}

/**
 * 시도 시작 시각(`started_at`)이 `[from, to)`인 실행의 지출 합(USD). 일일 예산은 실제로 돈 KST 날짜 기준이라
 * 회복된 지난 슬롯도 오늘 상한을 나눠 쓴다(#55 Ruling). 재시도는 `started_at`을 새 시도로 옮기므로 그 행의
 * 누적 지출은 마지막 시도의 날짜에 센다.
 */
export async function loadSpendBetween(
  db: RuntimeDb["db"],
  range: { readonly from: Date; readonly to: Date },
): Promise<number> {
  const [row] = await db
    .select({ spend: sql<number>`coalesce(sum(${batchRuns.spend_usd}), 0)`.mapWith(Number) })
    .from(batchRuns)
    .where(and(gte(batchRuns.started_at, range.from), lt(batchRuns.started_at, range.to)));
  return row?.spend ?? 0;
}

/** 배치 입력 기사 한 건: 기사 메타데이터 + 마지막 기사 버전의 식별자·본문(파이프라인 `ArticleInput`과 같은 모양). */
export type BatchArticle = Article & {
  readonly articleVersionId: string;
  readonly rawBody: string;
  /** 마지막 버전이 재수집의 정정 후보(#86)면 참. 아니면 없다. */
  readonly correctionCandidate?: boolean;
  /** 정정 후보 버전이 그 사건의 마지막 개정판 확인 시각 뒤에 들어왔으면(첫 재처리, #94) 참. 아니면 없다. */
  readonly correctionFirstReprocess?: boolean;
};

export interface BatchStory {
  readonly story: Story;
  readonly articles: readonly BatchArticle[];
  readonly latestRevision?: Revision;
  readonly deferredSince?: Date;
  /** 붙은 링크만 기사(#77, 본문 버전 없음)의 출처 구획 줄. 발행 시각·기사 식별자 순. */
  readonly linkOnlySources?: readonly RevisionSource[];
  /** 최신 개정판과 열린 에피소드 근거가 가리키는 옛 기사 버전(지금 버전과 다른 것)의 본문 — 좌표 정렬용(#86). */
  readonly previousVersionBodies?: readonly {
    readonly articleVersionId: string;
    readonly body: string;
  }[];
  /** 마지막 개정판에 없는 열린 상충 에피소드의 주장(#90, `openEpisodeClaims`). */
  readonly openEpisodeClaims?: readonly Claim[];
}

/** 사건의 최신 확인 시각(`story_revisions.checked_at` 최댓값). 개정판이 없으면 null. */
const latestCheckedAt = sql`(select max(${storyRevisions.checked_at}) from ${storyRevisions} where ${storyRevisions.story_id} = ${stories.id})`;

/**
 * 재처리 필요(스펙 "개정판 생성 조건": 입력이 바뀐 사건만): 미뤄졌거나, 개정판이 없거나, 마지막 처리 시각
 * (`last_processed_at`, 배정·갱신 버전이 올린다)이 최신 확인 시각보다 늦다. 배치 대상(`loadBatchStories`)은 이 조건,
 * 출처 추가 개정판의 바탕(`loadRevisionToExtend`)은 그 부정이다. 처리 시각이 없으면 늦지 않은 것으로 본다.
 */
export const storyNeedsReprocess = sql`(${stories.deferred_at} is not null or ${latestCheckedAt} is null or coalesce(${stories.last_processed_at} > ${latestCheckedAt}, false))`;

/**
 * 이번 배치가 처리할 라이브 사건: 종료가 아니고 재처리 필요(`storyNeedsReprocess`)인 사건. 사건마다 원자료(최신
 * 개정판·주장 개정판 이력·기사 버전 전부·최신 확인 시각)를 읽어 재처리 컨텍스트 규칙(`deriveReprocessContext`)으로
 * 기사 입력 버전·정정 표시·이전 본문·열린 에피소드를 정한다. 버전이 없는 기사는 뺀다(링크만 기사는
 * `linkOnlySources`로 따로 온다). 우선순위는 파이프라인이 정한다(`prioritizeStories`).
 */
export async function loadBatchStories(
  db: RuntimeDb["db"],
): Promise<{ readonly stories: readonly BatchStory[]; readonly sources: readonly Source[] }> {
  const storyRows = await db
    .select({
      story: stories,
      latestCheckedAt: sql<Date | null>`${latestCheckedAt}`.mapWith(
        (v: string | Date) => new Date(v),
      ),
    })
    .from(stories)
    .where(and(eq(stories.is_demo, false), ne(stories.lifecycle, "종료"), storyNeedsReprocess))
    .orderBy(stories.id);
  if (storyRows.length === 0) return { stories: [], sources: [] };
  const storyIds = storyRows.map((s) => s.story.id);

  const articleRows = await db
    .select()
    .from(articles)
    .where(inArray(articles.story_id, storyIds))
    .orderBy(articles.published_at, articles.id);
  const versionRows =
    articleRows.length === 0
      ? []
      : await db
          .select({
            articleId: articleVersions.article_id,
            articleVersionId: articleVersions.id,
            body: articleVersions.body,
            capturedAt: articleVersions.captured_at,
            correctionCandidate: articleVersions.correction_candidate,
          })
          .from(articleVersions)
          .where(
            inArray(
              articleVersions.article_id,
              articleRows.map((a) => a.id),
            ),
          )
          .orderBy(articleVersions.article_id, articleVersions.captured_at);
  const sourceIds = [...new Set(articleRows.map((a) => a.source_id))];
  const sourceRows =
    sourceIds.length === 0
      ? []
      : await db.select().from(sources).where(inArray(sources.id, sourceIds));

  const tierById = new Map(sourceRows.map((s) => [s.id, s.rights_tier]));
  const result: BatchStory[] = [];
  for (const { story: row, latestCheckedAt: checkedAt } of storyRows) {
    const storyArticles = articleRows.filter((a) => a.story_id === row.id);
    const storyArticleIds = new Set(storyArticles.map((a) => a.id));
    const loaded = await loadRevision(db, { storyId: row.id });
    const context = deriveReprocessContext({
      latestRevision: loaded?.revision,
      latestCheckedAt: checkedAt ?? undefined,
      claimHistory: loaded === undefined ? [] : await loadClaimHistory(db, { storyId: row.id }),
      articleVersions: versionRows.filter((v) => storyArticleIds.has(v.articleId)),
    });
    const batchArticles: BatchArticle[] = [];
    const linkOnlySources: RevisionSource[] = [];
    for (const article of storyArticles) {
      const version = context.currentVersions.get(article.id);
      if (version === undefined) {
        const tier = tierById.get(article.source_id);
        if (article.is_link_only && tier !== undefined) {
          linkOnlySources.push({
            sourceId: article.source_id,
            articleId: article.id,
            articleTitle: article.title,
            articleUrl: article.url,
            publishedAt: article.published_at,
            rightsTier: tier,
          });
        }
        continue;
      }
      batchArticles.push({
        id: article.id,
        sourceId: article.source_id,
        storyId: row.id,
        url: article.url,
        title: article.title,
        publishedAt: article.published_at,
        topics: article.topics,
        articleVersionId: version.articleVersionId,
        rawBody: version.body,
        ...(version.correctionCandidate ? { correctionCandidate: true } : {}),
        ...(version.correctionFirstReprocess ? { correctionFirstReprocess: true } : {}),
      });
    }
    if (batchArticles.length === 0) continue;
    result.push({
      story: toDomainStory(row),
      articles: batchArticles,
      ...(context.latestRevision === undefined ? {} : { latestRevision: context.latestRevision }),
      ...(row.deferred_at === null ? {} : { deferredSince: row.deferred_at }),
      ...(linkOnlySources.length === 0 ? {} : { linkOnlySources }),
      ...(context.previousVersionBodies === undefined
        ? {}
        : { previousVersionBodies: context.previousVersionBodies }),
      ...(context.openEpisodeClaims === undefined
        ? {}
        : { openEpisodeClaims: context.openEpisodeClaims }),
    });
  }
  return { stories: result, sources: sourceRows.map(toDomainSource) };
}

/** 미룬 사건에 "수집됨, 분석 대기" 시각을 적는다. 이미 미뤄진 사건의 시각은 유지한다(먼저 미룬 순 우선). */
export async function markStoriesDeferred(
  db: RuntimeDb["db"],
  input: { readonly storyIds: readonly string[]; readonly at: Date },
): Promise<void> {
  if (input.storyIds.length === 0) return;
  await db
    .update(stories)
    .set({
      deferred_at: sql`coalesce(${stories.deferred_at}, ${input.at.toISOString()}::timestamptz)`,
    })
    .where(inArray(stories.id, [...input.storyIds]));
}

/** 처리한(발행·확인·실패) 사건의 분석 대기 표시를 지운다. 실패한 사건도 지워 매 배치 맨 앞에서 예산을 먹지 않게 한다. */
export async function clearStoriesDeferred(
  db: RuntimeDb["db"],
  storyIds: readonly string[],
): Promise<void> {
  if (storyIds.length === 0) return;
  await db
    .update(stories)
    .set({ deferred_at: null })
    .where(inArray(stories.id, [...storyIds]));
}
