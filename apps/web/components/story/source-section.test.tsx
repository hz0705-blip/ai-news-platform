/** @jsxImportSource react */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SourceView } from "../../lib/story-view.ts";
import { SourceSection } from "./source-section.tsx";

afterEach(cleanup);

const common = {
  isFictional: false,
  region: "미확인",
  ownership: "unknown",
  language: "en",
} as const;

const gnews: SourceView = {
  ...common,
  id: "reuters.com",
  name: "Reuters",
  rightsTier: "본문 처리 + 발췌 표시",
  excerptAvailable: true,
  articleTitle: "Ports agree on framework",
  articleUrl: "https://www.reuters.com/world/ports",
  isLinkOnly: false,
  publishedAt: new Date("2026-09-16T22:00:00.000Z"),
};

const gdeltUnregistered: SourceView = {
  ...common,
  id: "gdelt:harbor-news.example",
  name: "harbor-news.example",
  rightsTier: "링크만",
  excerptAvailable: false,
  articleTitle: "Port pact signed",
  articleUrl: "https://harbor-news.example/pact",
  isLinkOnly: true,
  observedAt: new Date("2026-09-17T01:15:00.000Z"),
};

function rowOf(title: string): HTMLElement {
  const row = screen.getByRole("link", { name: title }).closest("li");
  if (row === null) throw new Error(`행을 찾지 못했다: ${title}`);
  return row;
}

describe("SourceSection", () => {
  it("link-only source row shows 관측 시각 and no-excerpt text", () => {
    render(<SourceSection sources={[gnews, gdeltUnregistered]} />);
    const row = within(rowOf("Port pact signed"));
    expect(row.getByText("관측 시각")).toBeTruthy();
    expect(row.queryByText("기사 발행")).toBeNull();
    expect(row.getByText("2026. 9. 17. 오전 10:15 KST").getAttribute("datetime")).toBe(
      "2026-09-17T01:15:00.000Z",
    );
    expect(row.getByText("링크만 제공하는 출처라 근거 발췌가 없습니다.")).toBeTruthy();
    expect(row.getByText("링크만")).toBeTruthy();
    expect(row.getByRole("link", { name: "Port pact signed" }).getAttribute("href")).toBe(
      "https://harbor-news.example/pact",
    );

    // 본문 처리 기사는 발행 시각이고 발췌 없음 문구가 없다.
    const body = within(rowOf("Ports agree on framework"));
    expect(body.getByText("기사 발행")).toBeTruthy();
    expect(body.queryByText("관측 시각")).toBeNull();
    expect(body.queryByText("링크만 제공하는 출처라 근거 발췌가 없습니다.")).toBeNull();
  });

  it("unregistered link-only source falls back to domain", () => {
    // 출처 표에 등록된 도메인이면 표 이름, 아니면 도메인(#77이 `gdelt:<domain>` 출처 이름을 도메인으로 만든다).
    const registered: SourceView = {
      ...gdeltUnregistered,
      id: "apnews.com",
      name: "Associated Press",
      articleTitle: "AP link",
      articleUrl: "https://apnews.com/article/x",
    };
    render(<SourceSection sources={[gdeltUnregistered, registered]} />);
    expect(within(rowOf("Port pact signed")).getByText("harbor-news.example")).toBeTruthy();
    expect(within(rowOf("AP link")).getByText("Associated Press")).toBeTruthy();
  });

  it("GNews 기사라도 출처 등급이 링크만으로 내려가면 발췌 없음 문구를 보이고 시각은 발행 시각이다", () => {
    render(
      <SourceSection sources={[{ ...gnews, rightsTier: "링크만", excerptAvailable: false }]} />,
    );
    const row = within(rowOf("Ports agree on framework"));
    expect(row.getByText("링크만 제공하는 출처라 근거 발췌가 없습니다.")).toBeTruthy();
    expect(row.getByText("기사 발행")).toBeTruthy();
  });
});
