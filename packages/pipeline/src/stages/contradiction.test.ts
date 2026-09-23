import { describe, expect, it } from "vitest";
import type { ModelClient } from "../types.ts";
import { runContradictionLabel } from "./contradiction.ts";

const tier = "본문 처리 + 발췌 표시" as const;
const client = (response: unknown): ModelClient => ({ complete: async () => response });
const input = {
  storyId: "story-x",
  claimKey: "c-1",
  previous: undefined,
  evidence: [
    { quoteId: "q-a", sourceId: "source-a", rightsTier: tier },
    { quoteId: "q-b", sourceId: "source-b", rightsTier: tier },
  ],
};

describe("상충 판정 단계", () => {
  it("쌍이 없어도 근거 하나면 단일 출처(Ruling 22-1 단일 근거 예외)", async () => {
    const out = await runContradictionLabel(
      { ...input, evidence: input.evidence.slice(0, 1) },
      client({ pairs: [] }),
    );
    expect(out.result).toEqual({ publish: true, status: "단일 출처", guard: 6 });
    expect(out.differsIn).toEqual({});
  });
  it("근거가 둘인데 관계 쌍이 없으면 원점 0으로 미발행(같은 명제인지 확인되지 않음)", async () => {
    const out = await runContradictionLabel(input, client({ pairs: [] }));
    expect(out.result).toMatchObject({
      publish: false,
      guard: 1,
      reason: expect.stringMatching(/독립 원점 0/),
    });
  });
  it("쌍의 인용 id가 주장 근거에 없거나 a와 b가 같으면 응답 스키마 불일치로 실패한다", async () => {
    await expect(
      runContradictionLabel(
        input,
        client({ pairs: [{ a: "q-없음", b: "q-b", label: "뒷받침 일치" }] }),
      ),
    ).rejects.toThrow(/응답 스키마 불일치/);
    await expect(
      runContradictionLabel(
        input,
        client({ pairs: [{ a: "q-a", b: "q-a", label: "뒷받침 일치" }] }),
      ),
    ).rejects.toThrow(/응답 스키마 불일치/);
  });
  it("통신 전재는 wireId 하나로 센다 — 두 출처가 같은 전재면 단일 출처", async () => {
    const wired = { ...input, evidence: input.evidence.map((e) => ({ ...e, wireId: "wire-1" })) };
    const out = await runContradictionLabel(
      wired,
      client({ pairs: [{ a: "q-a", b: "q-b", label: "뒷받침 일치" }] }),
    );
    expect(out.result).toMatchObject({ status: "단일 출처" });
  });
  it("두 원점이 뒷받침 일치면 복수 출처 일치", async () => {
    const out = await runContradictionLabel(
      input,
      client({ pairs: [{ a: "q-a", b: "q-b", label: "뒷받침 일치" }] }),
    );
    expect(out.result).toMatchObject({ status: "복수 출처 일치" });
  });
  it("양립 불가 쌍이면 보도 상충이고 다른 점을 양쪽 인용에 붙인다", async () => {
    const out = await runContradictionLabel(
      input,
      client({
        pairs: [
          {
            a: "q-a",
            b: "q-b",
            label: "양립 불가",
            differsIn: { "q-a": "모두 중단", "q-b": "일부 계속" },
          },
        ],
      }),
    );
    expect(out.result).toMatchObject({ status: "보도 상충", guard: 2 });
    expect(out.differsIn).toEqual({ "q-a": "모두 중단", "q-b": "일부 계속" });
  });
  it("양립 불가 쌍에 다른 점이 빠지면 스키마 불일치로 실패한다", async () => {
    await expect(
      runContradictionLabel(input, client({ pairs: [{ a: "q-a", b: "q-b", label: "양립 불가" }] })),
    ).rejects.toThrow(/응답 스키마 불일치/);
  });
  it("같은 출처의 자체 수정은 상충이 아니다 — 반대편 원점이 뒷받침 원점과 같으면 세지 않는다", async () => {
    const same = {
      ...input,
      evidence: [
        { quoteId: "q-a", sourceId: "source-a", rightsTier: tier },
        { quoteId: "q-a2", sourceId: "source-a", rightsTier: tier },
      ],
    };
    const out = await runContradictionLabel(
      same,
      client({
        pairs: [
          { a: "q-a", b: "q-a2", label: "양립 불가", differsIn: { "q-a": "x", "q-a2": "y" } },
        ],
      }),
    );
    expect(out.result).toMatchObject({ status: "단일 출처" });
  });
  it("판정 불가가 있으면 publish false(가드 ①)", async () => {
    const out = await runContradictionLabel(
      input,
      client({ pairs: [{ a: "q-a", b: "q-b", label: "판정 불가" }] }),
    );
    expect(out.result).toEqual({
      publish: false,
      previous: undefined,
      reason: expect.stringMatching(/판정 불가/),
      guard: 1,
    });
  });
  it("링크만 등급 근거는 원점이 아니다", async () => {
    const linkOnly = {
      ...input,
      evidence: [{ quoteId: "q-a", sourceId: "source-a", rightsTier: "링크만" as const }],
    };
    const out = await runContradictionLabel(linkOnly, client({ pairs: [] }));
    expect(out.result).toMatchObject({ publish: false, guard: 1 });
  });
});
