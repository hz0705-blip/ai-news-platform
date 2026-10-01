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

  it("파비콘·로고·공용 공유 이미지 URL은 null이다", () => {
    expect(toImageUrl("https://live.euronext.com/favicon.ico")).toBeNull();
    expect(
      toImageUrl(
        "https://cdn.allafrica.com/static/images/structure/aa-logo-rgba-no-text-square.png",
      ),
    ).toBeNull();
    expect(
      toImageUrl("https://static.seekingalpha.com/assets/og_image_1200-abc123.png"),
    ).toBeNull();
    expect(toImageUrl("https://images.example/sprite.png")).toBeNull();
    expect(toImageUrl("https://images.example/placeholder-16x9.jpg")).toBeNull();
    expect(toImageUrl("https://images.example/default.jpg")).toBeNull();
    expect(toImageUrl("https://images.example/app-icon.png")).toBeNull();
  });

  it("토큰이 부분 일치만 하는 사진 URL은 통과한다", () => {
    const urls = [
      "https://images.example/iconic-bridge.jpg",
      "https://images.example/logistics-port.jpg",
      "https://i.guim.co.uk/img/media/1a8408490abd4535d23dfe41b35fde19bd8e6767/603_706_3930_3144/master/3930.jpg?width=1200&height=630&quality=85&auto=format&fit=crop",
      "https://ichef.bbci.co.uk/ace/branded_news/1200/cpsprodpb/d849/live/8e2b1bb0-bd4c-11f1-a52c-0511052dc036.jpg",
      "https://images.example/",
    ];
    for (const url of urls) expect(toImageUrl(url)).toBe(url);
  });

  it("`.ico`·`.svg` 확장자는 null이다", () => {
    expect(toImageUrl("https://images.example/site.ico")).toBeNull();
    expect(toImageUrl("https://images.example/brand/mark.svg")).toBeNull();
  });

  it("대소문자·쿼리는 판정에 영향이 없다", () => {
    expect(toImageUrl("https://images.example/Site-LOGO.PNG")).toBeNull();
    expect(toImageUrl("https://images.example/FAVICON.ICO")).toBeNull();
    expect(toImageUrl("https://images.example/photo.jpg?type=logo&fmt=svg")).toBe(
      "https://images.example/photo.jpg?type=logo&fmt=svg",
    );
    expect(toImageUrl("https://logo.example/photo.jpg")).toBe("https://logo.example/photo.jpg");
  });
});
