import type { Revision, RevisionChange } from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { runBatch } from "./batch-run.ts";
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
