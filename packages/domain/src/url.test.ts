import { describe, expect, it } from "vitest";
import { MAX_IMAGE_URL_LENGTH, normalizeArticleUrl, toImageUrl } from "./url.ts";

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

describe("toImageUrl", () => {
  it("기사 이미지 URL은 http(s) 절대 URL이고 2048자 이하일 때만 남긴다", () => {
    expect(toImageUrl("https://images.example/a.jpg")).toBe("https://images.example/a.jpg");
    expect(toImageUrl(" http://images.example/a.jpg ")).toBe("http://images.example/a.jpg");
    expect(toImageUrl("ftp://images.example/a.jpg")).toBeNull();
    expect(toImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(toImageUrl("/relative/a.jpg")).toBeNull();
    expect(toImageUrl("")).toBeNull();
    expect(toImageUrl("   ")).toBeNull();
    expect(toImageUrl(null)).toBeNull();
    expect(toImageUrl(undefined)).toBeNull();
    const base = "https://images.example/";
    expect(toImageUrl(base + "a".repeat(MAX_IMAGE_URL_LENGTH - base.length))).not.toBeNull();
    expect(toImageUrl(base + "a".repeat(MAX_IMAGE_URL_LENGTH - base.length + 1))).toBeNull();
  });
});
