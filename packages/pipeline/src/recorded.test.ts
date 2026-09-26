import { describe, expect, it } from "vitest";
import { createRecordedModelClient } from "./recorded.ts";

describe("기록된 모델 클라이언트", () => {
  it("slug 하나(문자열)와 slug 목록을 모두 받는다", async () => {
    const key = "story-demo-1-agreement:c-1";
    const single = createRecordedModelClient("demo-1-agreement");
    const listed = createRecordedModelClient(["demo-1-agreement"]);
    expect(await listed.complete("contradiction-label", key)).toEqual(
      await single.complete("contradiction-label", key),
    );
  });

  it("여러 slug의 기록에 같은 키가 있으면 만들 때 던진다", () => {
    expect(() => createRecordedModelClient(["demo-1-agreement", "demo-1-agreement"])).toThrow(
      /기록된 응답 키 충돌/,
    );
  });
});
