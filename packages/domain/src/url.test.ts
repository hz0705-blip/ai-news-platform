import { describe, expect, it } from "vitest";
import { normalizeArticleUrl } from "./url.ts";

describe("normalizeArticleUrl", () => {
  it("normalizes article URL (scheme/host lowercase, strips www, query, fragment, trailing slash)", () => {
    expect(
      normalizeArticleUrl("HTTPS://WWW.Example.com/World/Story-1/?utm_source=x&ref=y#section"),
    ).toBe("https://example.com/World/Story-1");
  });

  it("루트 경로의 끝 `/`도 제거하고 비표준 포트는 남긴다", () => {
    expect(normalizeArticleUrl("http://example.com:8080/")).toBe("http://example.com:8080");
  });

  it("URL이 아니면 던진다", () => {
    expect(() => normalizeArticleUrl("not a url")).toThrow();
  });
});
