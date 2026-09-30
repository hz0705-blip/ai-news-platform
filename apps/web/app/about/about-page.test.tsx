import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Page, { metadata } from "./page.tsx";

const FAKE_EMAIL = "contact@example.com";
const section = (name: string) => screen.getByRole("region", { name });

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("소개", () => {
  it("절 제목이 스펙 소개 항목 순서대로 보인다", () => {
    render(<Page />);
    expect(metadata.title).toBe("서비스 소개");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("서비스 소개");
    // 스펙 "화면과 경험": 데이터 권리, 갱신 주기, 번역 원칙, 정정·삭제 요청, 개인정보 처리방침, 평가 리포트 링크.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "데이터 권리",
      "갱신 주기",
      "번역 원칙",
      "정정·삭제 요청",
      "개인정보 처리방침",
      "평가 리포트",
    ]);
    expect(
      within(section("데이터 권리"))
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["출처와 권리 등급", "데이터 보존"]);
  });

  it("GNews 위험 문구와 GDELT 표기 링크를 보인다", () => {
    render(<Page />);
    const rights = section("데이터 권리");
    expect(rights.textContent).toContain("기사 본문 전체는 어떤 화면에도 나오지 않습니다");
    expect(rights.textContent).toContain("GNews는 제공하는 기사의 저작권을 부인합니다");
    expect(rights.textContent).toContain("발행사별 권리 위험이 남아 있습니다");
    expect(
      within(rights).getByRole("link", { name: "The GDELT Project" }).getAttribute("href"),
    ).toBe("https://www.gdeltproject.org/");
  });

  it("갱신 시각과 원문 재수집 일정이 스펙과 같다", () => {
    render(<Page />);
    const updates = section("갱신 주기");
    // 스펙 "배치와 비용": 화면 표시 문구와 배치 시작 시각.
    expect(within(updates).getByText("매일 오전 6시, 오후 6시 갱신")).toBeDefined();
    expect(updates.textContent).toContain("05:00과 17:00");
    // 스펙 "개발 중 결정 항목" 원문 재수집과 변경 판별.
    expect(updates.textContent).toContain("발행 시각 ±24시간");
    expect(
      within(updates)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "활성 사건 기사: 수집 뒤 12시간·60시간에 각 1회",
      "휴면 사건 기사: 수집 뒤 7·14·28일째 표본(나이대마다 하루 40건 상한)",
      "본문 삭제(30일) 뒤의 기사와 종료된 사건의 기사는 다시 확인하지 않습니다.",
    ]);
  });

  it("데이터 보존 정책과 번역 원칙이 스펙과 같다", () => {
    render(<Page />);
    const rights = section("데이터 권리").textContent;
    expect(rights).toContain("기사 발행 시각 기준 30일 뒤 삭제합니다");
    expect(rights).toContain("사건 종료 후 90일");
    expect(rights).toContain("Supabase 7일");
    expect(rights).toContain("최대 30일 보관");
    const translation = section("번역 원칙").textContent;
    expect(translation).toContain("영어 원문으로 먼저");
    expect(translation).toContain("기계 번역, 참고용");
  });

  it("CONTACT_EMAIL이 있으면 mailto 링크와 72시간 안내를 보인다", () => {
    vi.stubEnv("CONTACT_EMAIL", FAKE_EMAIL);
    render(<Page />);
    const requests = section("정정·삭제 요청");
    const mail = within(requests).getByRole("link", {
      name: `${FAKE_EMAIL}로 정정·삭제 요청 메일 보내기`,
    });
    expect(mail.getAttribute("href")).toBe(
      `mailto:${FAKE_EMAIL}?subject=${encodeURIComponent("정정·삭제 요청")}`,
    );
    expect(requests.textContent).toContain("72시간 안에 처리");
    expect(requests.textContent).toContain("요청자 정보는 공개하지 않으며");
    expect(
      within(requests)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "대상 URL: 문제가 있는 사건 또는 개정판의 주소",
      "주장: 정정·삭제가 필요한 주장 문장",
      "근거: 요청하는 이유와 그것을 뒷받침하는 자료",
    ]);
    expect(requests.textContent).not.toContain("연락처 준비 중");
  });

  it("CONTACT_EMAIL이 없으면 연락처 준비 중을 보인다", () => {
    vi.stubEnv("CONTACT_EMAIL", "");
    const { container } = render(<Page />);
    expect(within(section("정정·삭제 요청")).getByText("연락처 준비 중")).toBeDefined();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(section("정정·삭제 요청").textContent).toContain("72시간 안에 처리");
  });

  it("처리방침 링크를 걸고 평가 리포트는 준비 중으로 둔다", () => {
    render(<Page />);
    expect(
      within(section("개인정보 처리방침"))
        .getByRole("link", { name: "개인정보 처리방침 읽기" })
        .getAttribute("href"),
    ).toBe("/privacy");
    const report = section("평가 리포트");
    expect(within(report).queryByRole("link")).toBeNull();
    expect(report.textContent).toContain("준비 중");
  });
});
