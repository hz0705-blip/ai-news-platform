import { describe, expect, it } from "vitest";
import { createArticleVersion } from "./article-version.ts";
import { judgeRecheckedBody, newCorrectionMarkers } from "./correction-marker.ts";

const body = "Seoul summoned the ambassador on Monday.\n\nThe ministry demanded an apology.";
const previous = createArticleVersion({
  id: "av-1",
  articleId: "a-1",
  rawBody: body,
  capturedAt: new Date("2026-09-28T20:00:00.000Z"),
});

describe("정정 표지 판정", () => {
  it("새로 생긴 정정 표지는 정정 후보", () => {
    const next = `${body}\n\nCorrection: An earlier version of this article misstated the day of the summons.`;
    const judged = judgeRecheckedBody(previous, next);
    expect(judged).toMatchObject({
      kind: "새 버전",
      change: "정정 후보",
      markers: ["Correction:", "An earlier version of this article"],
    });
  });

  it("Updated:만 있으면 원문 변경", () => {
    const next = `Updated: 9 hours ago.\n${body}`;
    expect(judgeRecheckedBody(previous, next)).toMatchObject({
      kind: "새 버전",
      change: "원문 변경",
      markers: [],
    });
  });

  it("이전 버전에 이미 있던 표지는 새로 생긴 것이 아니다", () => {
    const corrected = `CORRECTED-${body}`;
    expect(newCorrectionMarkers(corrected, `${corrected} More detail.`)).toEqual([]);
    expect(newCorrectionMarkers(body, corrected)).toEqual(["CORRECTED-"]);
  });

  it("정규화만 다른 본문은 새 버전이 아니다", () => {
    const sameAfterNormalization = `  ${body.replace(/\n/g, "\r\n")}\n\n\n\n&nbsp;`;
    expect(judgeRecheckedBody(previous, sameAfterNormalization)).toEqual({ kind: "변경 없음" });
    expect(judgeRecheckedBody(previous, `<p>${body}</p>`)).toEqual({ kind: "변경 없음" });
  });
});
