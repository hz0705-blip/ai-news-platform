import { describe, expect, it } from "vitest";
import { createArticleVersion } from "./article-version.ts";
import { sha256Hex } from "./hash.ts";

const capturedAt = new Date("2026-09-17T00:30:00.000Z");

describe("createArticleVersion", () => {
  it("정규화된 본문과 그 본문의 해시를 담는다", () => {
    const version = createArticleVersion({
      id: "av-1",
      articleId: "a-1",
      rawBody: "<p>Ministers agreed today.</p>",
      capturedAt,
    });

    expect(version.body).toBe("Ministers agreed today.");
    expect(version.bodyHash).toBe(sha256Hex("Ministers agreed today."));
    expect(version.normalizationVersion).toBe(1);
  });

  it("같은 원문은 같은 해시를 준다(불변 버전)", () => {
    const one = createArticleVersion({
      id: "av-1",
      articleId: "a-1",
      rawBody: "A\r\nB",
      capturedAt,
    });
    const two = createArticleVersion({ id: "av-2", articleId: "a-1", rawBody: "A\nB", capturedAt });
    expect(one.bodyHash).toBe(two.bodyHash);
  });
});
