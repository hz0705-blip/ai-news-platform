import type { Claim, Source } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { runBatch } from "./batch-run.ts";
import { DEMO_REFERENCE_TIME, LIVE_REFERENCE_TIME, loadDemoStoryFixture } from "./fixtures.ts";
import { MODEL_ID } from "./openai/client.ts";
import { createRecordedModelClient, type RecordedModelClientOptions } from "./recorded.ts";
import { BatchReportSchema } from "./schemas.ts";
import { ModelTransportError } from "./types.ts";

const fixture = loadDemoStoryFixture("demo-1-agreement");

function deps() {
  return {
    modelClient: createRecordedModelClient("demo-1-agreement"),
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    clock: () => DEMO_REFERENCE_TIME,
  };
}

function input() {
  return {
    articles: fixture.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: DEMO_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 10 },
    sources: fixture.sources,
    existingStories: [{ story: fixture.story }],
  };
}

/** 기록된 응답으로 첫 개정판을 발행해 돌려준다(이전 개정판이 있는 경우의 준비용). */
async function publishFirst() {
  const [latest] = (await runBatch(input(), deps())).revisions;
  if (latest === undefined) throw new Error("첫 개정판이 발행되지 않았다");
  return latest;
}

describe("배치 실행", () => {
  it("데모 사건 ①의 정답 개정판을 통째로 만든다(골든셋 첫 항목)", async () => {
    const result = await runBatch(input(), deps());

    expect(result.revisions).toHaveLength(1);
    // 정답 파일은 Revision과 같은 모양이다. 근거 구간 원문·해시·발췌·유형·양상·주장 상태·출처 구획까지 전부 비교한다.
    expect(result.revisions[0]).toEqual(fixture.golden);
  });

  it("링크만 기사는 근거를 주지 않지만 출처 구획에는 남는다", async () => {
    const result = await runBatch(input(), deps());
    const revision = result.revisions[0];
    const atlas = fixture.sources.find((s) => s.rightsTier === "링크만");
    expect(revision?.sources.map((s) => s.sourceId)).toContain(atlas?.id);
    expect(revision?.claims.flatMap((c) => c.evidence).some((e) => e.sourceId === atlas?.id)).toBe(
      false,
    );
  });

  it("같은 입력은 같은 개정판을 만든다(리플레이)", async () => {
    const first = await runBatch(input(), deps());
    const second = await runBatch(input(), deps());
    expect(JSON.stringify(second.revisions)).toBe(JSON.stringify(first.revisions));
  });

  it("첫 개정판이므로 변화는 없다", async () => {
    const result = await runBatch(input(), deps());
    expect(result.changes).toEqual([
      { storyId: fixture.story.id, revisionId: "demo-1-agreement:rev-1", changes: [] },
    ]);
  });

  /** c-1 문장만 다르게 쓴 주장 생성 기록(표현만 변경). */
  function rewordedClaims() {
    const [key, recorded] = Object.entries(fixture.recorded.claimGenerate)[0] ?? [];
    if (key === undefined || recorded === undefined) throw new Error("주장 생성 기록이 없다");
    return {
      [key]: {
        ...recorded,
        claims: recorded.claims.map((c) =>
          c.claimKey === "c-1" ? { ...c, text: `${c.text.slice(0, -1)}고 전해졌다.` } : c,
        ),
      },
    };
  }

  it("표현만 바뀐 재처리는 개정판을 만들지 않는다(#85)", async () => {
    const latest = await publishFirst();
    const again = await runBatch(
      { ...input(), existingStories: [{ story: fixture.story, latestRevision: latest }] },
      {
        ...deps(),
        modelClient: createRecordedModelClient("demo-1-agreement", {
          override: { "claim-generate": rewordedClaims() },
        }),
      },
    );
    expect(again.revisions).toEqual([]);
    expect(again.confirmed.map((c) => c.revisionId)).toEqual([latest.id]);
  });

  it("second batch keeps claim ids and stores changes", async () => {
    const latest = await publishFirst();
    // 이전 개정판에는 링크만 기사(Atlas)가 없었던 것으로 둔다 → 이번 개정판에서 출처 추가.
    const atlas = fixture.sources.find((s) => s.rightsTier === "링크만");
    const previous = { ...latest, sources: latest.sources.filter((s) => s.sourceId !== atlas?.id) };
    const result = await runBatch(
      { ...input(), existingStories: [{ story: fixture.story, latestRevision: previous }] },
      {
        ...deps(),
        modelClient: createRecordedModelClient("demo-1-agreement", {
          override: {
            "claim-generate": rewordedClaims(),
            // c-2의 Harbor 인용을 버린다 → 근거 교체(실질 변경).
            gate: {
              "story-demo-1-agreement:gate:c-2": {
                judgments: [
                  { quoteId: "q-m-2", label: "뒷받침", reason: "같다." },
                  { quoteId: "q-h-2", label: "뒷받침 안 됨", reason: "다르다." },
                ],
              },
            },
          },
        }),
      },
    );
    const [revision] = result.revisions;
    expect(revision?.id).toBe("demo-1-agreement:rev-2");
    expect(revision?.claims.map((c) => c.id)).toEqual(latest.claims.map((c) => c.id));

    const changes = result.changes[0]?.changes ?? [];
    expect(result.changes[0]?.revisionId).toBe("demo-1-agreement:rev-2");
    expect(changes).toContainEqual({
      kind: "주장 추가·삭제·수정",
      claimChange: "수정",
      claimId: "demo-1-agreement:c-2",
      previousText: latest.claims[1]?.text,
      currentText: latest.claims[1]?.text,
    });
    const atlasArticle = latest.sources.find((s) => s.sourceId === atlas?.id)?.articleId;
    expect(changes).toContainEqual({ kind: "출처 추가", articleId: atlasArticle });
    // c-1은 표현만 변경이므로 변화가 아니다.
    expect(changes.some((c) => "claimId" in c && c.claimId === "demo-1-agreement:c-1")).toBe(false);
  });

  it("근거가 게이트 1단계를 통과하지 못하면 그 사건을 발행하지 않는다", async () => {
    const broken = input();
    broken.articles = broken.articles.map((a) => ({
      ...a,
      rawBody: a.rawBody.replace(/agreed/g, "denied"),
    }));

    const result = await runBatch(broken, deps());

    expect(result.revisions).toEqual([]);
    expect(result.report.failed).toBe(1);
    expect(result.report.failures[0]?.reason).toMatch(/구간 없음/);
  });

  it("배치 리포트는 스키마를 통과하고 단계별 사용량과 상한 도달 여부를 담는다", async () => {
    const result = await runBatch(input(), deps());
    expect(BatchReportSchema.safeParse(result.report).success).toBe(true);
    expect(result.report.processed).toBe(1);
    expect(result.report.deferred).toBe(0);
    expect(result.report.budgetReached).toBe(false);
    expect(result.report.droppedClaims).toEqual([]);
    expect(result.report.usage.map((u) => u.stage)).toEqual([
      "evidence-extract",
      "claim-generate",
      "gate",
      "contradiction-label",
      "revision",
    ]);
  });

  it("판정 불가 주장은 그 주장만 빼고 나머지로 발행한다(Ruling 22-4)", async () => {
    const result = await runBatch(input(), {
      ...deps(),
      modelClient: createRecordedModelClient("demo-1-agreement", {
        override: {
          "contradiction-label": {
            "story-demo-1-agreement:c-1": {
              pairs: [{ a: "q-m-1", b: "q-h-1", label: "판정 불가" }],
            },
          },
        },
      }),
    });
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]?.claims.map((c) => c.id)).toEqual([
      "demo-1-agreement:c-2",
      "demo-1-agreement:c-3",
      "demo-1-agreement:c-4",
    ]);
    expect(result.report.droppedClaims).toEqual([
      {
        storyId: "story-demo-1-agreement",
        claimKey: "c-1",
        reason: expect.stringMatching(/판정 불가/),
      },
    ]);
  });
  it("모든 주장이 판정 불가면 사건을 발행하지 않는다", async () => {
    const pairs = (m: string, h: string) => ({ pairs: [{ a: m, b: h, label: "판정 불가" }] });
    const result = await runBatch(input(), {
      ...deps(),
      modelClient: createRecordedModelClient("demo-1-agreement", {
        override: {
          "contradiction-label": {
            "story-demo-1-agreement:c-1": pairs("q-m-1", "q-h-1"),
            "story-demo-1-agreement:c-2": pairs("q-m-2", "q-h-2"),
            "story-demo-1-agreement:c-3": pairs("q-m-3", "q-h-3"),
            "story-demo-1-agreement:c-4": pairs("q-m-4", "q-h-4"),
          },
        },
      }),
    });
    expect(result.revisions).toEqual([]);
    expect(result.report.failures[0]?.reason).toMatch(/표시할 주장이 없다/);
    expect(result.report.droppedClaims).toHaveLength(4);
  });

  it("이전 개정판과 출처·주장·상태가 같으면 개정판을 만들지 않고 확인만 남긴다(스펙 134행)", async () => {
    const latest = await publishFirst();
    const again = await runBatch(
      {
        ...input(),
        now: new Date("2026-09-18T00:30:00.000Z"),
        existingStories: [{ story: fixture.story, latestRevision: latest }],
      },
      deps(),
    );
    expect(again.revisions).toEqual([]);
    expect(again.confirmed).toEqual([
      {
        storyId: fixture.story.id,
        revisionId: latest.id,
        checkedAt: new Date("2026-09-18T00:30:00.000Z"),
      },
    ]);
    expect(again.report.processed).toBe(1);
  });
  it("이전 개정판에서 보도 상충이던 주장이 이번에 빠져도 열린 에피소드로 사건은 보도 상충(스펙 133행)", async () => {
    const latest = await publishFirst();
    const conflicted = {
      ...latest,
      contradictionStatus: "보도 상충" as const,
      claims: latest.claims.map((c, i) =>
        i === 0 ? { ...c, contradictionStatus: "보도 상충" as const } : c,
      ),
    };
    const result = await runBatch(
      { ...input(), existingStories: [{ story: fixture.story, latestRevision: conflicted }] },
      {
        ...deps(),
        modelClient: createRecordedModelClient("demo-1-agreement", {
          override: {
            "contradiction-label": {
              "story-demo-1-agreement:c-1": {
                pairs: [{ a: "q-m-1", b: "q-h-1", label: "판정 불가" }],
              },
            },
          },
        }),
      },
    );
    expect(result.revisions[0]?.claims.map((c) => c.id)).not.toContain("demo-1-agreement:c-1");
    expect(result.revisions[0]?.contradictionStatus).toBe("보도 상충");
  });
  /**
   * 개정판 1에서 c-1이 보도 상충, 개정판 2에서 c-1이 빠진(요약 제외) 상태를 만든다. 개정판 2에는 링크만 기사가 없어
   * 이번 재처리는 출처 추가로 새 개정판이 된다. `openEpisodeClaims`는 적재가 claim_revisions에서 파생하는 값이다.
   */
  async function episodeAbsentFromLatest() {
    const first = await publishFirst();
    const atlas = fixture.sources.find((s) => s.rightsTier === "링크만");
    const disputed = { ...(first.claims[0] as Claim), contradictionStatus: "보도 상충" as const };
    const latest = {
      ...first,
      id: "demo-1-agreement:rev-2",
      revisionNumber: 2,
      contradictionStatus: "보도 상충" as const,
      claims: first.claims.filter((c) => c.id !== disputed.id),
      sources: first.sources.filter((s) => s.sourceId !== atlas?.id),
    };
    return { latest, disputed };
  }
  const undeterminableC1 = {
    "contradiction-label": {
      "story-demo-1-agreement:c-1": { pairs: [{ a: "q-m-1", b: "q-h-1", label: "판정 불가" }] },
    },
  } as const;

  it("본문이 지워진 기사에만 근거가 있던 주장은 다음 개정판에 그대로 남고 삭제 변화로 나오지 않는다(#144)", async () => {
    const { latest: base } = await episodeAbsentFromLatest();
    const template = base.claims[0] as Claim;
    const goneId = "demo-1-agreement:c-gone";
    // 본문을 지운 기사 a-gone(이번 입력에 없음)에만 근거가 있는 주장.
    const gone: Claim = {
      ...template,
      id: goneId,
      text: "지운 본문의 기사만 뒷받침하는 주장.",
      order: base.claims.length,
      evidence: template.evidence.slice(0, 1).map((e) => ({
        ...e,
        id: `${base.id}/${goneId}:q-gone-1`,
        claimId: goneId,
        articleId: "a-gone",
        articleVersionId: "av-gone",
      })),
    };
    const latest = { ...base, claims: [...base.claims, gone] };
    const run = (carriedClaims?: readonly Claim[]) =>
      runBatch(
        {
          ...input(),
          existingStories: [
            {
              story: fixture.story,
              latestRevision: latest,
              ...(carriedClaims ? { carriedClaims } : {}),
            },
          ],
        },
        deps(),
      );

    const result = await run([gone]);
    const carried = result.revisions[0]?.claims.find((c) => c.id === goneId);
    const { id: _id, order: _order, evidence: _evidence, ...rest } = gone;
    expect(carried).toMatchObject(rest);
    expect(carried?.evidence.map(({ id, verifiedAt: _v, ...e }) => ({ id, ...e }))).toEqual(
      gone.evidence.map(({ verifiedAt: _v, ...e }) => ({
        ...e,
        id: `demo-1-agreement:rev-3/${goneId}:q-gone-1`,
      })),
    );
    const deleted = (changes: typeof result.changes) =>
      changes
        .flatMap((c) => c.changes)
        .filter((c) => c.kind === "주장 추가·삭제·수정" && c.claimChange === "삭제");
    expect(deleted(result.changes)).toEqual([]);
    // 대조: 옮겨 싣지 않으면 삭제 변화가 된다.
    expect(deleted((await run()).changes).map((c) => c.claimId)).toEqual([goneId]);
  });

  it("개정판 N의 열린 상충 에피소드는 N+1에서 분쟁 주장이 빠져도 사건 상태를 보도 상충으로 유지한다(#90)", async () => {
    const { latest, disputed } = await episodeAbsentFromLatest();
    const run = (openEpisodeClaims: readonly Claim[]) =>
      runBatch(
        {
          ...input(),
          existingStories: [{ story: fixture.story, latestRevision: latest, openEpisodeClaims }],
        },
        {
          ...deps(),
          modelClient: createRecordedModelClient("demo-1-agreement", {
            override: undeterminableC1,
          }),
        },
      );
    const result = await run([disputed]);
    const [revision] = result.revisions;
    expect(revision?.revisionNumber).toBe(3);
    expect(revision?.claims.map((c) => c.id)).not.toContain(disputed.id);
    expect(revision?.contradictionStatus).toBe("보도 상충");
    // 대조: 에피소드를 넘기지 않으면(마지막 개정판만 보면) 에피소드가 사라진다.
    expect((await run([])).revisions[0]?.contradictionStatus).not.toBe("보도 상충");
  });

  it("열린 상충 에피소드는 명시 정정·해소 입력으로만 닫힌다(#90)", async () => {
    const { latest, disputed } = await episodeAbsentFromLatest();
    const run = (articles: ReturnType<typeof input>["articles"], episode: Claim = disputed) =>
      runBatch(
        {
          ...input(),
          articles,
          existingStories: [
            { story: fixture.story, latestRevision: latest, openEpisodeClaims: [episode] },
          ],
        },
        deps(),
      );
    // 분쟁 주장이 다시 나와도 명시 입력이 없으면(뒷받침 일치 라벨뿐) 식별자를 잇고 보도 상충에 머문다.
    const silent = (await run(input().articles)).revisions[0];
    const back = silent?.claims.find((c) => c.id === disputed.id);
    expect(back?.contradictionStatus).toBe("보도 상충");
    expect(silent?.contradictionStatus).toBe("보도 상충");

    // 그 주장의 근거 기사 하나가 정정 후보 새 버전이고 그 근거가 바뀌었으면(좌표 정렬 실패, 명시 정정 입력) 에피소드가 닫힌다.
    const correctedArticle = disputed.evidence[0]?.articleId;
    const onOldVersion = {
      ...disputed,
      evidence: disputed.evidence.map((e) =>
        e.articleId === correctedArticle
          ? { ...e, articleVersionId: `${e.articleVersionId}-old` }
          : e,
      ),
    };
    const corrected = (
      await run(
        input().articles.map((a) =>
          a.id === correctedArticle
            ? { ...a, correctionCandidate: true, correctionFirstReprocess: true }
            : a,
        ),
        onOldVersion,
      )
    ).revisions[0];
    expect(corrected?.claims.find((c) => c.id === disputed.id)?.contradictionStatus).toBe("정정됨");
    expect(corrected?.contradictionStatus).toBe("정정됨");
  });

  it("주장 순서·differsIn만 다른 재처리는 새 개정판 없이 확인 시각만 남긴다(#90)", async () => {
    const first = await publishFirst();
    const [a, b, ...rest] = first.claims;
    if (a === undefined || b === undefined) throw new Error("주장이 둘 이상이어야 한다");
    const latest = {
      ...first,
      claims: [
        { ...b, order: a.order },
        {
          ...a,
          order: b.order,
          evidence: a.evidence.map((e) => ({ ...e, differsIn: "이전 판정의 다른 점" })),
        },
        ...rest,
      ],
    };
    const checkedAt = new Date("2026-09-18T01:00:00.000Z");
    const again = await runBatch(
      {
        ...input(),
        now: checkedAt,
        existingStories: [{ story: fixture.story, latestRevision: latest }],
      },
      deps(),
    );
    expect(again.revisions).toEqual([]);
    expect(again.changes).toEqual([]);
    expect(again.confirmed).toEqual([
      { storyId: fixture.story.id, revisionId: latest.id, checkedAt },
    ]);
  });
  it("이전 개정판이 있고 내용이 다르면 개정판 번호가 하나 오르고 근거 id에 개정판이 들어간다", async () => {
    const latest = await publishFirst();
    const changed = await runBatch(
      {
        ...input(),
        existingStories: [
          { story: fixture.story, latestRevision: { ...latest, contradictionStatus: "단일 출처" } },
        ],
      },
      deps(),
    );
    expect(changed.revisions[0]?.revisionNumber).toBe(2);
    expect(changed.revisions[0]?.id).toBe("demo-1-agreement:rev-2");
    expect(changed.revisions[0]?.claims[0]?.evidence[0]?.id).toMatch(
      /^demo-1-agreement:rev-2\/demo-1-agreement:c-1:q-/,
    );
  });

  it("이전 개정판의 사건이 다르면 그 사건을 실패로 리포트한다", async () => {
    const latest = await publishFirst();
    const result = await runBatch(
      {
        ...input(),
        existingStories: [
          { story: fixture.story, latestRevision: { ...latest, storyId: "story-other" } },
        ],
      },
      deps(),
    );
    expect(result.revisions).toEqual([]);
    expect(result.confirmed).toEqual([]);
    expect(result.report.failures[0]?.reason).toMatch(/이전 개정판의 사건이 다르다/);
  });

  it("양립 불가 쌍의 다른 점은 그 주장 근거의 differsIn으로 개정판에 남는다(Ruling 22-6)", async () => {
    const result = await runBatch(input(), {
      ...deps(),
      modelClient: createRecordedModelClient("demo-1-agreement", {
        override: {
          "contradiction-label": {
            "story-demo-1-agreement:c-1": {
              pairs: [
                {
                  a: "q-m-1",
                  b: "q-h-1",
                  label: "양립 불가",
                  differsIn: { "q-m-1": "모두 중단", "q-h-1": "일부 계속" },
                },
              ],
            },
          },
        },
      }),
    });
    const claim = result.revisions[0]?.claims.find((c) => c.id === "demo-1-agreement:c-1");
    expect(claim?.contradictionStatus).toBe("보도 상충");
    expect(claim?.evidence.map((e) => e.differsIn)).toEqual(["모두 중단", "일부 계속"]);
    expect(result.revisions[0]?.contradictionStatus).toBe("보도 상충");
  });

  it("아는 사건에 배정되지 않은 기사의 사건은 사건 미배정으로 실패한다", async () => {
    const result = await runBatch({ ...input(), existingStories: [] }, deps());
    expect(result.revisions).toEqual([]);
    expect(result.report.failures).toEqual([
      { storyId: fixture.story.id, reason: "실패: 사건 미배정" },
    ]);
  });

  it("출처가 등록되지 않은 기사의 사건은 출처 미등록으로 실패한다", async () => {
    const result = await runBatch({ ...input(), sources: [] }, deps());
    expect(result.revisions).toEqual([]);
    expect(result.report.failures).toEqual([
      { storyId: fixture.story.id, reason: "실패: 출처 미등록" },
    ]);
  });

  it("기록된 응답이 없으면 배치는 던지지 않고 그 사건을 실패로 리포트한다", async () => {
    const onlyMeridian = input();
    onlyMeridian.articles = onlyMeridian.articles.slice(0, 1);
    const result = await runBatch(onlyMeridian, deps());
    expect(result.revisions).toEqual([]);
    expect(result.report.failed).toBe(1);
    expect(result.report.failures[0]?.reason).toMatch(/기록된 응답 없음: claim-generate/);
  });

  it("실제 네트워크를 타지 않는다", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("네트워크 호출이 일어났다");
    }) as typeof fetch;
    try {
      await expect(runBatch(input(), deps())).resolves.toBeDefined();
    } finally {
      globalThis.fetch = original;
    }
  });
});

/** 여러 사건의 출처 목록을 합칠 때 같은 id가 두 번 들어가지 않게 한다. */
function dedupeById(sources: readonly Source[]): Source[] {
  return [...new Map(sources.map((s) => [s.id, s])).values()];
}

describe("두 사건 배치", () => {
  const one = loadDemoStoryFixture("demo-1-agreement");
  const two = loadDemoStoryFixture("demo-2-conflict");
  const both = () => ({
    articles: [...one.articles, ...two.articles].map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: DEMO_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 10 },
    sources: dedupeById([...one.sources, ...two.sources]),
    existingStories: [{ story: one.story }, { story: two.story }],
  });
  const bothDeps = (override?: RecordedModelClientOptions["override"]) => ({
    modelClient: createRecordedModelClient(
      ["demo-1-agreement", "demo-2-conflict"],
      override === undefined ? {} : { override },
    ),
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    clock: () => DEMO_REFERENCE_TIME,
  });
  it("데모 ①·② 리플레이가 둘 다 골든과 같다", async () => {
    const result = await runBatch(both(), bothDeps());
    expect(result.revisions).toEqual([one.golden, two.golden]);
    const again = await runBatch(both(), bothDeps());
    expect(JSON.stringify(again.revisions)).toBe(JSON.stringify(result.revisions));
  });
  it("한 사건의 게이트 실패는 그 사건만 미발행이고 다른 사건은 발행된다(스펙 159행)", async () => {
    const broken = one.recorded.evidenceExtract["av-meridian"];
    if (broken === undefined) throw new Error("데모 ① 근거 추출 기록이 없다");
    const result = await runBatch(
      both(),
      bothDeps({
        "evidence-extract": {
          "av-meridian": {
            quotes: broken.quotes.map((q, i) =>
              i === 0 ? { ...q, quote: "이 문장은 기사에 없다" } : q,
            ),
          },
        },
      }),
    );
    expect(result.revisions.map((r) => r.storyId)).toEqual([two.story.id]);
    expect(result.report.failed).toBe(1);
    expect(result.report.failures[0]).toMatchObject({
      storyId: one.story.id,
      reason: expect.stringMatching(/구간 없음/),
    });
  });
  it("게이트 2단계 응답이 스키마를 어기면 그 사건만 실패하고 다른 사건은 발행된다", async () => {
    const result = await runBatch(
      both(),
      bothDeps({
        gate: {
          "story-demo-1-agreement:gate:c-1": {
            judgments: [{ quoteId: "q-m-1", label: "확실함", reason: "" }],
          },
        },
      }),
    );
    expect(result.revisions).toEqual([two.golden]);
    expect(result.report.failures).toEqual([
      { storyId: one.story.id, reason: expect.stringMatching(/^gate .*응답 스키마 불일치/) },
    ]);
  });
  it("게이트 2단계가 뒷받침하지 않는 주장은 그 주장만 빼고 발행한다", async () => {
    const result = await runBatch(
      both(),
      bothDeps({
        gate: {
          "story-demo-1-agreement:gate:c-1": {
            judgments: [
              { quoteId: "q-m-1", label: "부분 뒷받침", reason: "시점이 없다" },
              { quoteId: "q-h-1", label: "뒷받침 안 됨", reason: "다른 명제" },
            ],
          },
        },
      }),
    );
    expect(result.revisions[0]?.claims.map((c) => c.id)).not.toContain("demo-1-agreement:c-1");
    expect(result.report.droppedClaims).toEqual([
      {
        storyId: one.story.id,
        claimKey: "c-1",
        reason: "게이트 2단계 미통과: q-m-1=부분 뒷받침, q-h-1=뒷받침 안 됨",
      },
    ]);
  });
});

describe("실제 모델로 기록한 사건(live-hormuz-proposal, #54)", () => {
  const live = loadDemoStoryFixture("live-hormuz-proposal");
  const liveInput = () => ({
    articles: live.articles.map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: LIVE_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend: 1 },
    sources: live.sources,
    existingStories: [{ story: live.story }],
  });
  const liveDeps = () => ({
    modelClient: createRecordedModelClient("live-hormuz-proposal", { modelId: MODEL_ID }),
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    clock: () => LIVE_REFERENCE_TIME,
  });

  it("기록된 실제 응답을 리플레이하면 기록 때와 같은 개정판이 나온다", async () => {
    const result = await runBatch(liveInput(), liveDeps());
    expect(result.revisions).toEqual([live.golden]);
    expect(result.revisions[0]?.modelId).toBe("gpt-5-mini-2025-08-07");
    // 기록 때 게이트 2단계가 부분 뒷받침으로 뺀 주장은 리플레이에서도 빠진다.
    expect(result.report.droppedClaims.map((d) => d.claimKey)).toEqual(["c-2", "c-3"]);
  });
});

describe("예산·기한·재시도(#55)", () => {
  const one = loadDemoStoryFixture("demo-1-agreement");
  const two = loadDemoStoryFixture("demo-2-conflict");
  /** 데모 ①의 모델 호출 수: 근거 추출 2 + 주장 생성 1 + 게이트 2단계 4 + 상충 라벨 4. */
  const ONE_CALLS = 11;
  const PER_CALL = 0.01;
  /** ①의 호출은 다 되고 ②의 첫 예약은 안 되는 예산(경계에 두면 부동소수 합이 흔들린다). */
  const BUDGET_FOR_ONE = (ONE_CALLS + 0.5) * PER_CALL;

  /** 기록된 응답을 돌려주되 호출마다 고정 사용량을 보고하고, 지정한 호출 순번에 오류를 던진다. */
  function spendingClient(failures: Readonly<Record<number, () => Error>> = {}) {
    const inner = createRecordedModelClient(["demo-1-agreement", "demo-2-conflict"]);
    let calls = 0;
    const client = {
      modelId: inner.modelId,
      get calls() {
        return calls;
      },
      async complete(request: Parameters<typeof inner.complete>[0]) {
        calls++;
        const fail = failures[calls];
        if (fail !== undefined) throw fail();
        const response = await inner.complete(request);
        return { output: response.output, usage: { tokens: 100, spend: PER_CALL } };
      },
    };
    return client;
  }
  const both = (spend: number, extra: Partial<Parameters<typeof runBatch>[0]> = {}) => ({
    articles: [...one.articles, ...two.articles].map((a) => ({ ...a.meta, rawBody: a.rawBody })),
    now: DEMO_REFERENCE_TIME,
    dailyBudget: { tokens: 1_000_000, spend },
    sources: dedupeById([...one.sources, ...two.sources]),
    existingStories: [{ story: one.story }, { story: two.story }],
    concurrency: 1,
    ...extra,
  });
  const budgetDeps = (modelClient: ReturnType<typeof spendingClient>) => ({
    modelClient,
    embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
    clock: () => DEMO_REFERENCE_TIME,
    sleep: async () => {},
    reservation: () => PER_CALL,
  });

  it("budget cap defers lower-priority incidents in priority order", async () => {
    // 데모 ①(기사 3)이 데모 ②(기사 2)보다 먼저다. 예산은 ①의 호출만큼만.
    const result = await runBatch(both(BUDGET_FOR_ONE), budgetDeps(spendingClient()));
    expect(result.revisions).toEqual([one.golden]);
    expect(result.report.deferredStories).toEqual([two.story.id]);
    expect(result.report).toMatchObject({
      processed: 1,
      deferred: 1,
      failed: 0,
      budgetReached: true,
      deadlineReached: false,
    });
    expect(result.report.usage.reduce((sum, u) => sum + u.spend, 0)).toBeCloseTo(
      ONE_CALLS * PER_CALL,
      10,
    );
  });

  it("deferred incidents are prioritized in the next batch", async () => {
    const result = await runBatch(
      both(BUDGET_FOR_ONE, {
        existingStories: [
          { story: one.story },
          { story: two.story, deferredSince: new Date("2026-09-16T20:00:00Z") },
        ],
      }),
      budgetDeps(spendingClient()),
    );
    expect(result.revisions).toEqual([two.golden]);
    expect(result.report.deferredStories).toEqual([one.story.id]);
  });

  it("timed-out attempt is charged its reservation, not retried, and does not affect other incidents", async () => {
    const client = spendingClient({
      // 데모 ①의 세 번째 호출(주장 생성)이 제한 시간을 넘긴다.
      3: () =>
        new ModelTransportError("claim-generate", "k", "제한 시간 초과", {
          retryable: false,
          billable: true,
        }),
    });
    const result = await runBatch(both(10), budgetDeps(client));
    expect(result.revisions).toEqual([two.golden]);
    expect(result.report.failures).toEqual([
      { storyId: one.story.id, reason: expect.stringMatching(/제한 시간 초과/) },
    ]);
    // ① 근거 추출 2회 + 실패한 시도의 예약액 + ② 호출 전부. 재시도는 없다.
    const twoCalls = client.calls - 3;
    expect(result.report.usage.reduce((sum, u) => sum + u.spend, 0)).toBeCloseTo(
      (2 + 1 + twoCalls) * PER_CALL,
      10,
    );
  });

  it("reserves per attempt so retries cannot exceed the daily cap", async () => {
    const retryable = () =>
      new ModelTransportError("evidence-extract", "k", "HTTP 429", {
        retryable: true,
        billable: false,
      });
    // 첫 호출이 두 번 429를 받고 세 번째 시도에 성공한다. 예산은 ①의 호출만큼.
    const client = spendingClient({ 1: retryable, 2: retryable });
    const result = await runBatch(both(BUDGET_FOR_ONE), budgetDeps(client));
    expect(result.revisions).toEqual([one.golden]);
    expect(client.calls).toBe(ONE_CALLS + 2);
    expect(result.report.deferredStories).toEqual([two.story.id]);

    // 재시도 횟수를 소진하면 그 사건은 실패한다.
    const exhausted = spendingClient({ 1: retryable, 2: retryable, 3: retryable });
    const failed = await runBatch(both(10), budgetDeps(exhausted));
    expect(failed.report.failures).toEqual([
      { storyId: one.story.id, reason: expect.stringMatching(/HTTP 429/) },
    ]);
    expect(failed.revisions).toEqual([two.golden]);
  });

  it("batch deadline defers incidents not yet started and marks the report", async () => {
    let tick = 0;
    const deadline = new Date(DEMO_REFERENCE_TIME.getTime() + 5 * 60_000);
    const result = await runBatch(both(10, { deadline }), {
      ...budgetDeps(spendingClient()),
      // 호출마다 1분이 흐른다: ①의 여섯 번째 호출 전에 기한이 지난다.
      clock: () => new Date(DEMO_REFERENCE_TIME.getTime() + tick++ * 60_000),
    });
    expect(result.revisions).toEqual([]);
    expect(result.report.deferredStories).toEqual([one.story.id, two.story.id]);
    expect(result.report.deadlineReached).toBe(true);
    expect(result.report.budgetReached).toBe(false);
  });

  it("reports usage deltas after each story so spend can be ledgered incrementally", async () => {
    const deltas: { tokens: number; spend: number }[] = [];
    const result = await runBatch(both(10), {
      ...budgetDeps(spendingClient()),
      onUsage: async (delta) => {
        deltas.push(delta);
      },
    });
    expect(deltas.length).toBe(2);
    const total = result.report.usage.reduce((sum, u) => sum + u.spend, 0);
    expect(deltas.reduce((sum, d) => sum + d.spend, 0)).toBeCloseTo(total, 10);
    expect(deltas[0]?.spend).toBeCloseTo(ONE_CALLS * PER_CALL, 10);
  });

  it("batch report passes the schema with deferred stories and deadline flag", async () => {
    const result = await runBatch(both(BUDGET_FOR_ONE), budgetDeps(spendingClient()));
    expect(BatchReportSchema.safeParse(result.report).success).toBe(true);
  });
});
