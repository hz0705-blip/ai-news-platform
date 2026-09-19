import { describe, expect, it } from "vitest";
import { TOPICS } from "./topic.ts";

describe("TOPICS", () => {
  it("상한 도달 처리 우선순위 순서로 토픽 4개를 CONTEXT.md 문자열 그대로 담는다", () => {
    expect(TOPICS).toEqual([
      "한국 관련 해외 보도",
      "국제 정치·외교·안보",
      "세계 경제·금융",
      "기술·AI",
    ]);
  });

  it("중복 없이 정확히 4개다", () => {
    expect(new Set(TOPICS).size).toBe(4);
  });
});
