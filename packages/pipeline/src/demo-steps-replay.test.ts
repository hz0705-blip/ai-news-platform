import type { Revision, RevisionChange } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { runBatch } from "./batch-run.ts";
import { createRecordedModelClient } from "./recorded.ts";

type RecordedOverride = NonNullable<
  NonNullable<Parameters<typeof createRecordedModelClient>[1]>["override"]
>;

import {
  createDemoStepModelClient,
  demoStepBatchInput,
  listGoldenSetSlugs,
  loadDemoStepGolden,
  loadDemoStorySteps,
} from "./fixtures.ts";

/**
 * 데모 사건 단계 리플레이(#88): 골든셋 사건마다 단계를 순서대로 기록된 응답으로 돌려, 단계별 개정판과 변화가 정답과
 * 같은지 본다. 각 단계의 직전 개정판은 앞 단계의 정답이다(적재는 DB의 최신 개정판).
 */
async function replay(slug: string) {
  const demo = loadDemoStorySteps(slug);
  const results: { revision: Revision | undefined; changes: readonly RevisionChange[] }[] = [];
  let latestRevision: Revision | undefined;
  for (const [index, step] of demo.steps.entries()) {
    const result = await runBatch(
      demoStepBatchInput(demo, index, latestRevision ? { latestRevision } : {}),
      {
        modelClient: createDemoStepModelClient(step),
        embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
        clock: () => step.at,
      },
    );
    expect(result.report.failures).toEqual([]);
    results.push({ revision: result.revisions[0], changes: result.changes[0]?.changes ?? [] });
    latestRevision = loadDemoStepGolden(slug, step.number).revision;
  }
  return results;
}

describe.each(listGoldenSetSlugs())("데모 사건 %s 단계 리플레이", (slug) => {
  it("단계마다 정답 개정판과 변화가 같다", async () => {
    const demo = loadDemoStorySteps(slug);
    const results = await replay(slug);
    expect(results).toHaveLength(demo.steps.length);
    for (const [index, step] of demo.steps.entries()) {
      const golden = loadDemoStepGolden(slug, step.number);
      expect(results[index]?.revision).toEqual(golden.revision);
      expect(results[index]?.changes).toEqual(golden.changes);
    }
  });

  it("데모 표식과 가상 출처 표기를 가진다", () => {
    const demo = loadDemoStorySteps(slug);
    expect(demo.story.isDemo).toBe(true);
    for (const source of demo.sources) {
      expect(source.isFictional).toBe(true);
      expect(source.name).toMatch(/가상 출처/);
    }
  });
});

describe("데모 사건 ③④ 시나리오", () => {
  it("데모 ③ 2단계: 명시 정정으로 상충이 해소되고 원문 변경·상태 변화·주장 수정이 기록된다", async () => {
    const [first, second] = await replay("demo-3-correction");
    expect(first?.revision?.contradictionStatus).toBe("보도 상충");
    expect(first?.changes).toEqual([]);
    const revision = second?.revision;
    expect(revision?.revisionNumber).toBe(2);
    expect(revision?.contradictionStatus).toBe("정정됨");

    const changes = second?.changes ?? [];
    // 상충이던 주장은 식별자를 잇고 문장이 바뀌며(이전·현재 병기) 보도 상충 → 정정됨으로 간다.
    const conflicted = "demo-3-correction:c-1";
    expect(first?.revision?.claims.find((c) => c.id === conflicted)?.contradictionStatus).toBe(
      "보도 상충",
    );
    expect(changes).toContainEqual(
      expect.objectContaining({
        kind: "주장 추가·삭제·수정",
        claimChange: "수정",
        claimId: conflicted,
        previousText: expect.any(String),
        currentText: expect.any(String),
      }),
    );
    expect(changes).toContainEqual({
      kind: "상충 상태 변화",
      claimId: conflicted,
      previousStatus: "보도 상충",
      currentStatus: "정정됨",
    });
    expect(changes).toContainEqual({
      kind: "상충 상태 변화",
      previousStatus: "보도 상충",
      currentStatus: "정정됨",
    });
    // 정정 표지 없는 새 버전만 원문 변경이다(정정 후보 버전은 상태 변화로 드러난다).
    expect(changes.filter((c) => c.kind === "원문 변경")).toEqual([
      {
        kind: "원문 변경",
        articleId: "article-meridian-kessel",
        articleVersionId: "av-meridian-kessel-2",
      },
    ]);
    expect(changes.some((c) => c.kind === "출처 추가")).toBe(false);
  });

  it("정정 표지 버전에서 근거가 바뀐 주장만 명시 정정을 받는다", async () => {
    const [, second] = await replay("demo-3-correction");
    const status = (id: string) =>
      second?.revision?.claims.find((c) => c.id === id)?.contradictionStatus;
    // c-1: 정정 후보 기사(하버)의 근거 구간이 정정 문단으로 바뀌어 좌표 정렬 실패 → 명시 정정.
    expect(status("demo-3-correction:c-1")).toBe("정정됨");
    // c-4: 하버 근거가 새 좌표로 그대로 옮겨졌고 문장만 다르다(표현만 변경) → 상태 유지.
    expect(status("demo-3-correction:c-4")).toBe("복수 출처 일치");
    // c-5@rev-2: 정정 후보 버전에서 새로 생긴 주장은 명시 정정을 받지 않는다.
    expect(status("demo-3-correction:c-5@rev-2")).toBeDefined();
    expect(status("demo-3-correction:c-5@rev-2")).not.toBe("정정됨");
  });

  /** 데모 ③ 2단계 입력을 rev-2 정답 위에서 첫 재처리 표시 없이 다시 처리한다(이후 배치). */
  async function reprocessAfterCorrection(override?: RecordedOverride) {
    const demo = loadDemoStorySteps("demo-3-correction");
    const step = demo.steps[1];
    if (step === undefined) throw new Error("단계 없음");
    const input = demoStepBatchInput(demo, 1, {
      latestRevision: loadDemoStepGolden("demo-3-correction", 2).revision,
    });
    return runBatch(
      {
        ...input,
        articles: input.articles.map(({ correctionFirstReprocess: _, ...article }) => article),
      },
      {
        modelClient: createRecordedModelClient(step.recordedSlug, {
          modelId: step.modelId,
          ...(override === undefined ? {} : { override }),
        }),
        embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
        clock: () => step.at,
      },
    );
  }

  it("정정됨 주장은 첫 재처리 표시 없이 다시 처리돼도 정정됨으로 남고 상태 변화가 없다", async () => {
    const result = await reprocessAfterCorrection();
    // 같은 내용이라 새 개정판 없이 확인만 한다 — c-1은 rev-2 정답의 정정됨 그대로다.
    expect(result.revisions).toEqual([]);
    expect(result.confirmed.map((c) => c.revisionId)).toEqual(["demo-3-correction:rev-2"]);
  });

  it("정정됨 주장에 새 상충이 생기면 보도 상충으로 재개된다", async () => {
    const result = await reprocessAfterCorrection({
      "contradiction-label": {
        "story-demo-3-correction:c-1": {
          pairs: [
            {
              a: "q-395b22-1",
              b: "q-af6e5b-1",
              label: "양립 불가",
              differsIn: { "q-395b22-1": "가결", "q-af6e5b-1": "연기" },
            },
          ],
        },
      },
    });
    const revision = result.revisions[0];
    expect(
      revision?.claims.find((c) => c.id === "demo-3-correction:c-1")?.contradictionStatus,
    ).toBe("보도 상충");
    expect(result.changes[0]?.changes).toContainEqual({
      kind: "상충 상태 변화",
      claimId: "demo-3-correction:c-1",
      previousStatus: "정정됨",
      currentStatus: "보도 상충",
    });
  });

  it("정정 후보 버전은 다음 배치 재처리에서 다시 명시 정정을 주지 않는다", async () => {
    // 같은 정정 후보 버전이 최신인 채 다시 재처리되는 배치(첫 재처리 아님): 적재는 correctionFirstReprocess를 싣지 않는다.
    const demo = loadDemoStorySteps("demo-3-correction");
    const step = demo.steps[1];
    if (step === undefined) throw new Error("단계 없음");
    const input = demoStepBatchInput(demo, 1, {
      latestRevision: loadDemoStepGolden("demo-3-correction", 1).revision,
    });
    const later = {
      ...input,
      articles: input.articles.map(({ correctionFirstReprocess: _, ...article }) => article),
    };
    expect(later.articles.some((a) => a.correctionCandidate)).toBe(true);
    const result = await runBatch(later, {
      modelClient: createDemoStepModelClient(step),
      embeddingClient: { embed: async () => ({ vectors: [], usage: { tokens: 0, spend: 0 } }) },
      clock: () => step.at,
    });
    const claims = result.revisions[0]?.claims ?? [];
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.some((c) => c.contradictionStatus === "정정됨")).toBe(false);
  });

  it("데모 ④ 2단계: 시점이 다른 수치는 상충이 아니고 주장 변화·출처 추가만 기록된다", async () => {
    const [first, second] = await replay("demo-4-figures");
    const revision = second?.revision;
    expect(revision?.revisionNumber).toBe(2);
    // 월요일 4,200만 달러 주장은 식별자를 잇고, 화요일 9,500만 달러는 새 주장이다. 어느 주장도 보도 상충이 아니다.
    expect(revision?.claims.find((c) => c.id === "demo-4-figures:c-2")?.text).toContain("4,200만");
    expect(revision?.claims.some((c) => c.text.includes("9,500만"))).toBe(true);
    for (const claim of [...(first?.revision?.claims ?? []), ...(revision?.claims ?? [])]) {
      expect(claim.contradictionStatus).not.toBe("보도 상충");
    }
    expect(revision?.contradictionStatus).not.toBe("보도 상충");

    const changes = second?.changes ?? [];
    expect(new Set(changes.map((c) => c.kind))).toEqual(
      new Set(["주장 추가·삭제·수정", "출처 추가"]),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({
        claimChange: "추가",
        currentText: expect.stringContaining("9,500만"),
      }),
    );
    expect(changes.filter((c) => c.kind === "출처 추가")).toEqual([
      { kind: "출처 추가", articleId: "article-meridian-liss-followup" },
    ]);
  });
});
