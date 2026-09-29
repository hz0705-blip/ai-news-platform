import { expect, test } from "@playwright/test";

// 공유 카드(스펙 "화면과 경험" 공유 카드): 스크랩 UA는 클라이언트 실행 없이 받은 HTML만 읽는다.
// 브라우저를 쓰지 않는 HTTP 요청이라 한 엔진에서만 돈다.
const STORY_URL = "/story/demo-1-agreement";
const SCRAPERS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
];

const meta = (html: string, key: string): string | undefined =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];

test("scraper user agents get 200 html with og tags", async ({ request, browserName }) => {
  test.skip(browserName !== "chromium", "HTTP 요청만 한다");
  for (const userAgent of SCRAPERS) {
    const response = await request.get(STORY_URL, { headers: { "user-agent": userAgent } });
    expect(response.status(), userAgent).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    const html = await response.text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(meta(head, "og:title"), userAgent).toContain("데모 사건");
    expect(meta(head, "og:description"), userAgent).toBeTruthy();
    expect(meta(head, "og:image:width")).toBe("1200");
    expect(meta(head, "og:image:height")).toBe("600");
    expect(meta(head, "twitter:card")).toBe("summary_large_image");
    expect(meta(head, "og:image"), userAgent).toMatch(
      /\/og\/story\/demo-1-agreement\/[^/]+\/ko-t\d+-f[\d.]+\.png$/,
    );
  }

  const html = await (
    await request.get(STORY_URL, { headers: { "user-agent": "Twitterbot/1.0" } })
  ).text();
  const image = new URL(meta(html, "og:image") ?? "").pathname;
  const png = await request.get(image);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  const body = await png.body();
  // IHDR의 너비·높이
  expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 600]);
});
