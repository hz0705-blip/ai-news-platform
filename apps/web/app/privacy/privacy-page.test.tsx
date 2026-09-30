import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETION_INTENT_COOKIE, DELETION_STATUS_COOKIE } from "../../lib/account/deletion.ts";
import { GOOGLE_SCOPE, supabaseAuthCookieName } from "../../lib/auth/env.ts";
import { KAKAO_NONCE_COOKIE, KAKAO_SCOPE, KAKAO_STATE_COOKIE } from "../../lib/auth/kakao.ts";
import { RETURN_COOKIE } from "../../lib/auth/urls.ts";
import { ANON_COOKIE } from "../../lib/search/guard.ts";
import { LEGAL_EFFECTIVE_DATE } from "../legal.ts";
import Page, { metadata } from "./page.tsx";

const FAKE_EMAIL = "contact@example.com";
const section = (name: string) => screen.getByRole("region", { name });

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("개인정보 처리방침", () => {
  it("처리방침 목차가 스펙 순서대로 모두 있다", () => {
    render(<Page />);
    expect(metadata.title).toBe("개인정보 처리방침");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("개인정보 처리방침");
    // 스펙 "개발 중 결정 항목" 법적 페이지 범위의 처리방침 목차.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "운영자·연락처·시행일",
      "처리 목적·항목·법적 근거·보존",
      "수집 방법·필수/선택·거부 시 결과",
      "처리 위탁과 국외 이전",
      "보존·파기",
      "권리 행사",
      "쿠키",
      "안전 조치",
    ]);
    // 목적·항목·법적 근거·보존 표의 행: 인증 식별자·제공자 정보, 팔로우·마지막으로 본 개정판, 남용 방지, 보안 로그, 요청자 연락처.
    const purposes = section("처리 목적·항목·법적 근거·보존");
    expect(
      within(purposes)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      "인증 식별자와 로그인 제공자 정보",
      "팔로우·마지막으로 본 개정판",
      "남용 방지 쿠키·IP HMAC",
      "보안 로그",
      "요청자 연락처",
    ]);
    for (const article of within(purposes).getAllByRole("article")) {
      expect(
        within(article)
          .getAllByRole("term")
          .map((t) => t.textContent),
      ).toEqual(["목적", "항목", "법적 근거", "보존"]);
    }
  });

  it("쿠키 표 이름이 코드 쿠키 상수와 같다", () => {
    render(<Page />);
    const rows = within(section("쿠키")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
      supabaseAuthCookieName("<프로젝트 ref>"),
      RETURN_COOKIE,
      KAKAO_STATE_COOKIE,
      KAKAO_NONCE_COOKIE,
      DELETION_INTENT_COOKIE,
      DELETION_STATUS_COOKIE,
      ANON_COOKIE,
    ]);
    const anon = rows.at(-1);
    expect(anon?.textContent).toContain("24시간");
  });

  it("제공자 메타데이터 scope가 실제 요청 scope와 같다", () => {
    render(<Page />);
    const identity = within(section("처리 목적·항목·법적 근거·보존")).getAllByRole("article")[0];
    expect(identity?.textContent).toContain(`Kakao(요청 범위 ${KAKAO_SCOPE})`);
    expect(identity?.textContent).toContain(`Google(요청 범위 ${GOOGLE_SCOPE})`);
    expect(KAKAO_SCOPE).toBe("openid,profile_nickname,account_email");
    expect(GOOGLE_SCOPE).toBe("email profile");
  });

  it("위탁 업체와 지역·보존을 적고 쓰지 않는 업체는 적지 않는다", () => {
    render(<Page />);
    const processors = section("처리 위탁과 국외 이전");
    expect(
      within(processors)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Supabase", "Vercel", "OpenAI", "Railway", "GitHub(Actions)"]);
    const text = processors.textContent ?? "";
    expect(text).toContain("ap-northeast-2");
    expect(text).toContain("icn1");
    expect(text).toContain("asia-southeast1");
    expect(text).toContain("store: false");
    for (const unused of ["Sentry", "Langfuse", "Healthchecks", "GNews", "GDELT"]) {
      expect(text).not.toContain(unused);
    }
  });

  it("계정 삭제 경로와 백업 잔존 기간을 보인다", () => {
    render(<Page />);
    expect(
      within(section("권리 행사"))
        .getByRole("link", { name: "계정 화면으로 가기" })
        .getAttribute("href"),
    ).toBe("/account");
    const retention = section("보존·파기").textContent;
    expect(retention).toContain("즉시");
    expect(retention).toContain("Supabase 7일, GitHub Actions 아티팩트 90일");
  });

  it("CONTACT_EMAIL이 있으면 mailto 링크를 보인다", () => {
    vi.stubEnv("CONTACT_EMAIL", FAKE_EMAIL);
    render(<Page />);
    const operator = section("운영자·연락처·시행일");
    expect(
      within(operator)
        .getByRole("link", { name: `${FAKE_EMAIL}로 개인정보 문의 메일 보내기` })
        .getAttribute("href"),
    ).toBe(`mailto:${FAKE_EMAIL}?subject=${encodeURIComponent("개인정보 문의")}`);
    expect(operator.textContent).not.toContain("연락처 준비 중");
  });

  it("CONTACT_EMAIL이 없으면 연락처 준비 중을 보인다", () => {
    vi.stubEnv("CONTACT_EMAIL", " ");
    const { container } = render(<Page />);
    expect(within(section("운영자·연락처·시행일")).getByText("연락처 준비 중")).toBeDefined();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("시행일을 상수에서 보인다", () => {
    render(<Page />);
    expect(
      within(section("운영자·연락처·시행일")).getByText(`시행일: ${LEGAL_EFFECTIVE_DATE}`),
    ).toBeDefined();
  });
});
