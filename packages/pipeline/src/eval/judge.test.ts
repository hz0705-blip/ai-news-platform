import { describe, expect, it } from "vitest";
import {
  buildJudgeRequest,
  flipCounts,
  flipSample,
  type JudgeTask,
  layoutJudgeTask,
} from "./judge.ts";

const task: JudgeTask = {
  packetId: "dev-03",
  pipeline: ["c-1", "c-2", "c-3"].map((id, i) => ({
    id,
    text: `가상 주장 ${i + 1}번`,
    evidence: [`Sentence one of item ${i + 1}.`, `Sentence two of item ${i + 1}.`],
  })),
  gold: ["dev-03/claim:c1", "dev-03/claim:c2"].map((id, i) => ({
    id,
    text: `정답 주장 ${i + 1}번`,
    evidence: [`Gold sentence ${i + 1}.`],
  })),
};

describe("주장 매칭 판정자", () => {
  it("판정자 순서 섞기와 뒤집기 표본은 시드로 결정된다", () => {
    const original = layoutJudgeTask(task, "original");
    expect(layoutJudgeTask(task, "original")).toEqual(original);
    const reversed = layoutJudgeTask(task, "reversed");
    expect(reversed.pipelineSide).toBe(original.pipelineSide);
    expect(reversed.A.map((c) => c.id)).toEqual([...original.A.map((c) => c.id)].reverse());
    expect(reversed.B[0]?.evidence).toEqual([...(original.B.at(-1)?.evidence ?? [])].reverse());

    const ids = Array.from({ length: 17 }, (_, i) => `dev-${String(i + 1).padStart(2, "0")}`);
    const sample = flipSample(ids);
    expect(sample).toHaveLength(4);
    expect(flipSample([...ids].reverse())).toEqual(sample);
  });

  it("출처를 가리고 화면 식별자를 내부 식별자로 되돌린다", () => {
    const request = buildJudgeRequest(task, "original");
    expect(request.input).not.toContain("c-1");
    expect(request.input).not.toContain("claim:");
    const layout = layoutJudgeTask(task, "original");
    const pipelineList = layout.pipelineSide;
    const goldList = pipelineList === "A" ? "B" : "A";
    const decoded = request.decode({
      matches: [
        { a: "A1", b: "B1" },
        { a: "A1", b: "B2" },
        { a: "A9", b: "B1" },
      ],
    }) as { matches: { pipeline: string; gold: string }[]; dropped: number };
    const first = (side: "A" | "B") => layout[side][0]?.id;
    expect(decoded.dropped).toBe(2);
    expect(decoded.matches).toEqual([
      {
        pipeline: first(pipelineList),
        gold: first(goldList),
      },
    ]);
    expect(
      flipCounts(
        [{ pipeline: "c-1", gold: "g1" }],
        [
          { pipeline: "c-1", gold: "g1" },
          { pipeline: "c-2", gold: "g2" },
        ],
      ),
    ).toEqual({ flipped: 1, union: 2 });
  });
});
