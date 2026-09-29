import { describe, expect, it } from "vitest";
import { detectInAppBrowser, externalOpenUrl } from "./in-app.ts";

const KAKAOTALK_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5";
const KAKAOTALK_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 KAKAOTALK/10.8.5 (INAPP)";
const NAVER_INAPP_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.6.3)";
const NAVER_HIGGS_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(higgs; search; 1210; 12.6.1; 15ProMax)";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36";
const CHROME_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const NAVER_BLOG_INAPP =
  "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 NAVER(inapp; blog; 100; 1.0.0)";

const START = "https://news.example/auth/login/start?provider=google&next=%2Fstory%2Fdemo-1";

describe("detectInAppBrowser — 인앱 UA 판별", () => {
  it.each([
    [KAKAOTALK_IOS, "kakaotalk"],
    [KAKAOTALK_ANDROID, "kakaotalk"],
  ])("KakaoTalk 인앱을 감지한다", (ua, expected) => {
    expect(detectInAppBrowser(ua)).toBe(expected);
  });

  it.each([
    [NAVER_INAPP_ANDROID, "naver"],
    [NAVER_HIGGS_IOS, "naver"],
  ])("NAVER inapp·higgs 검색 인앱을 감지한다", (ua, expected) => {
    expect(detectInAppBrowser(ua)).toBe(expected);
  });

  it.each([SAFARI_IOS, CHROME_ANDROID, CHROME_DESKTOP, NAVER_BLOG_INAPP])(
    "일반 브라우저와 검색 외 NAVER UA는 음성이다",
    (ua) => {
      expect(detectInAppBrowser(ua)).toBeNull();
    },
  );
});

describe("externalOpenUrl — 외부 브라우저 열기 시도 URL", () => {
  it("KakaoTalk은 openExternal 스킴에 로그인 시작 URL을 인코딩해 싣는다", () => {
    expect(externalOpenUrl("kakaotalk", KAKAOTALK_IOS, START)).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(START)}`,
    );
  });

  it("Android NAVER는 같은 주소의 intent:// URL이다", () => {
    expect(externalOpenUrl("naver", NAVER_INAPP_ANDROID, START)).toBe(
      "intent://news.example/auth/login/start?provider=google&next=%2Fstory%2Fdemo-1#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end",
    );
  });

  it("iOS NAVER는 열기 스킴이 없어 null이다(링크 복사·메뉴 안내만)", () => {
    expect(externalOpenUrl("naver", NAVER_HIGGS_IOS, START)).toBeNull();
  });
});
