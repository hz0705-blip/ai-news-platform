import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_EFFECTIVE_DATE } from "../legal.ts";
import Page, { metadata } from "./page.tsx";

const FAKE_EMAIL = "contact@example.com";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("이용약관", () => {
  it("약관 목차가 스펙 순서대로 모두 있다", () => {
    render(<Page />);
    expect(metadata.title).toBe("이용약관");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이용약관");
    // 스펙 "개발 중 결정 항목" 법적 페이지 범위의 약관 목차.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "익명 읽기",
      "선택 계정",
      "이용 한도",
      "서비스 종료",
      "출처와 기계 번역의 한계",
      "정정·게시 중단",
      "연락처",
    ]);
    expect(screen.getByText(`시행일: ${LEGAL_EFFECTIVE_DATE}`)).toBeDefined();
    expect(
      within(screen.getByRole("region", { name: "선택 계정" }))
        .getByRole("link", { name: "개인정보 처리방침" })
        .getAttribute("href"),
    ).toBe("/privacy");
  });

  it("연락처는 CONTACT_EMAIL이 있으면 mailto, 없으면 연락처 준비 중이다", () => {
    vi.stubEnv("CONTACT_EMAIL", FAKE_EMAIL);
    render(<Page />);
    const contact = screen.getByRole("region", { name: "연락처" });
    expect(within(contact).getByRole("link").getAttribute("href")).toMatch(
      new RegExp(`^mailto:${FAKE_EMAIL}\\?`),
    );
    cleanup();
    vi.stubEnv("CONTACT_EMAIL", "");
    render(<Page />);
    expect(
      within(screen.getByRole("region", { name: "연락처" })).getByText("연락처 준비 중"),
    ).toBeDefined();
  });
});
