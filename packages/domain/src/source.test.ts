import { describe, expect, it } from "vitest";
import { matchSourceByDomain, type Source, sourceHostOf } from "./source.ts";

const registered = (id: string, domains: readonly string[], isExcluded = false): Source => ({
  id,
  name: id,
  rightsTier: "본문 처리 + 발췌 표시",
  region: "kr",
  ownership: "private",
  language: "en",
  isFictional: false,
  domains,
  isExcluded,
});

const registry: readonly Source[] = [
  registered("yna.co.kr", ["yna.co.kr"], true),
  registered("indiatimes.com", ["indiatimes.com"]),
  registered("economictimes.indiatimes.com", ["economictimes.indiatimes.com"]),
  registered("thestar.com.my", ["thestar.com.my", "star2.com"]),
];

describe("matchSourceByDomain", () => {
  it("matchSourceByDomain matches www/case/subdomain rule", () => {
    expect(matchSourceByDomain("https://www.yna.co.kr", registry)?.id).toBe("yna.co.kr");
    expect(matchSourceByDomain("HTTPS://EN.YNA.CO.KR/view/1", registry)?.id).toBe("yna.co.kr");
    expect(matchSourceByDomain("https://en.yna.co.kr", registry)?.isExcluded).toBe(true);
    // 서브도메인만 맞고 다른 도메인은 맞지 않는다(`notyna.co.kr`은 `yna.co.kr`의 서브도메인이 아니다).
    expect(matchSourceByDomain("https://notyna.co.kr", registry)).toBeUndefined();
    // 두 번째 도메인으로도 맞는다.
    expect(matchSourceByDomain("https://www.star2.com/x", registry)?.id).toBe("thestar.com.my");
  });

  it("prefers the longest matching domain and returns undefined for unknown hosts or non-URLs", () => {
    expect(matchSourceByDomain("https://economictimes.indiatimes.com/a", registry)?.id).toBe(
      "economictimes.indiatimes.com",
    );
    expect(matchSourceByDomain("https://timesofindia.indiatimes.com/a", registry)?.id).toBe(
      "indiatimes.com",
    );
    expect(matchSourceByDomain("https://www.reuters.com", registry)).toBeUndefined();
    expect(matchSourceByDomain("not a url", registry)).toBeUndefined();
  });

  it("sourceHostOf lowercases and strips www.", () => {
    expect(sourceHostOf(" https://WWW.Example.COM/path ")).toBe("example.com");
    expect(sourceHostOf("")).toBeUndefined();
  });
});
