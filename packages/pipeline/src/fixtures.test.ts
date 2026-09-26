import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLAIM_TYPES,
  CONTRADICTION_STATUSES,
  checkEvidenceSpan,
  findSpan,
  MODALITIES,
  normalizeBody,
  RIGHTS_TIERS,
  sha256Hex,
  spanText,
} from "@newsplatform/domain";
import { describe, expect, it } from "vitest";
import { DEMO_REFERENCE_TIME, listGoldenSetSlugs, loadDemoStoryFixture } from "./fixtures.ts";

describe.each(["demo-1-agreement", "demo-2-conflict"] as const)("데모 사건 픽스처 %s", (slug) => {
  const fixture = loadDemoStoryFixture(slug);

  it("데모 표식과 가상 출처 표기를 가진다", () => {
    expect(fixture.story.isDemo).toBe(true);
    for (const source of fixture.sources) {
      expect(source.isFictional).toBe(true);
      expect(source.name).not.toMatch(/Reuters|AP|AFP|Bloomberg|BBC|CNN/i);
    }
  });

  it("사건 제목은 15~45자다", () => {
    expect([...fixture.story.title].length).toBeGreaterThanOrEqual(15);
    expect([...fixture.story.title].length).toBeLessThanOrEqual(45);
  });

  it("주장은 3~5개이고 각 40~120자다", () => {
    const claims = fixture.golden.claims;
    expect(claims.length).toBeGreaterThanOrEqual(3);
    expect(claims.length).toBeLessThanOrEqual(5);
    for (const claim of claims) {
      const length = [...claim.text].length;
      expect(length).toBeGreaterThanOrEqual(40);
      expect(length).toBeLessThanOrEqual(120);
    }
  });

  it("기록된 응답은 인용문만 담고 정수 오프셋을 담지 않는다", () => {
    const raw = JSON.stringify(fixture.recorded);
    expect(raw).not.toMatch(/"(start|end|offset)"/);
  });

  it("모든 근거 인용문이 정규화 본문에 있고 게이트 1단계를 통과한다", () => {
    for (const claim of fixture.golden.claims) {
      for (const evidence of claim.evidence) {
        const article = fixture.articles.find((a) => a.meta.id === evidence.articleId);
        expect(article).toBeDefined();
        if (article === undefined) continue;
        const body = normalizeBody(article.rawBody);
        const span = findSpan(body, evidence.spanText);
        expect(span).toBeDefined();
        if (span === undefined) continue;
        const source = fixture.sources.find((s) => s.id === article.meta.sourceId);
        expect(source).toBeDefined();
        if (source === undefined) continue;
        expect(
          checkEvidenceSpan({
            body,
            span,
            rightsTier: source.rightsTier,
            normalizationVersion: 1,
          }).ok,
        ).toBe(true);
      }
    }
  });

  it("시각은 데모 기준 시각 이전으로 고정돼 있다", () => {
    for (const article of fixture.articles) {
      expect(article.meta.publishedAt.getTime()).toBeLessThanOrEqual(DEMO_REFERENCE_TIME.getTime());
    }
  });

  it("열거값이 도메인 상수 안에 있다(오타가 tsc를 통과해도 여기서 잡힌다)", () => {
    for (const source of fixture.sources) {
      expect(RIGHTS_TIERS).toContain(source.rightsTier);
    }
    expect(CONTRADICTION_STATUSES).toContain(fixture.golden.contradictionStatus);
    for (const claim of fixture.golden.claims) {
      expect(CLAIM_TYPES).toContain(claim.claimType);
      expect(MODALITIES).toContain(claim.modality);
      expect(CONTRADICTION_STATUSES).toContain(claim.contradictionStatus);
    }
  });

  it("모든 근거의 spanHash·excerpt·highlightInExcerpt가 정규화 본문에서 다시 계산한 값과 같다(골든 드리프트 방지)", () => {
    for (const claim of fixture.golden.claims) {
      for (const evidence of claim.evidence) {
        const article = fixture.articles.find((a) => a.meta.id === evidence.articleId);
        expect(article).toBeDefined();
        if (article === undefined) continue;
        const body = normalizeBody(article.rawBody);
        const span = findSpan(body, evidence.spanText);
        expect(span).toBeDefined();
        if (span === undefined) continue;

        expect(span).toEqual(evidence.span);
        expect(sha256Hex(spanText(body, span))).toBe(evidence.spanHash);

        const source = fixture.sources.find((s) => s.id === article.meta.sourceId);
        expect(source).toBeDefined();
        if (source === undefined) continue;
        const gate = checkEvidenceSpan({
          body,
          span,
          rightsTier: source.rightsTier,
          normalizationVersion: 1,
        });
        expect(gate.ok).toBe(true);
        if (!gate.ok) continue;
        expect(gate.excerpt).toBe(evidence.excerpt);
        expect(gate.excerptSpan).toEqual(evidence.excerptSpan);
        expect(gate.highlightInExcerpt).toEqual(evidence.highlightInExcerpt);
      }
    }
  });
});

describe("데모 사건 ① 픽스처 경로 검증", () => {
  it("slug에 경로 조작 문자가 있으면 던진다", () => {
    expect(() => loadDemoStoryFixture("../demo-1-agreement" as never)).toThrow(/올바르지 않다/);
  });
});

describe("골든셋", () => {
  it("항목 두 개이며 slug 순서가 고정된다", () => {
    expect(listGoldenSetSlugs()).toEqual(["demo-1-agreement", "demo-2-conflict"]);
  });
  it("모든 항목이 CC-BY-4.0·운영자 저작이고 expected 파일이 존재한다", () => {
    const set = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../fixtures/golden-set.json"), "utf8"),
    ) as { license: string; labelSource: string; expected: string }[];
    for (const entry of set) {
      expect(entry.license).toBe("CC-BY-4.0");
      expect(entry.labelSource).toBe("운영자 저작");
      expect(existsSync(resolve(import.meta.dirname, "..", entry.expected))).toBe(true);
    }
  });
});

describe("데모 사건 ② 상충 구조", () => {
  const fixture = loadDemoStoryFixture("demo-2-conflict");
  it("사건 상태는 보도 상충이고 상충 주장은 하나(c-2)", () => {
    expect(fixture.golden?.contradictionStatus).toBe("보도 상충");
    expect(
      fixture.golden?.claims.filter((c) => c.contradictionStatus === "보도 상충").map((c) => c.id),
    ).toEqual(["demo-2-conflict:c-2"]);
  });
  it("상충 주장의 근거는 두 원점 모두 다른 점을 갖고, 다른 주장의 근거는 갖지 않는다", () => {
    const conflict = fixture.golden?.claims.find((c) => c.id === "demo-2-conflict:c-2");
    expect(conflict?.evidence.map((e) => e.differsIn)).toEqual([
      expect.stringContaining("중단"),
      expect.stringContaining("계속"),
    ]);
    for (const claim of fixture.golden?.claims ?? []) {
      if (claim.id === "demo-2-conflict:c-2") continue;
      expect(claim.evidence.every((e) => e.differsIn === undefined)).toBe(true);
    }
  });
  it("양립 불가 쌍의 두 인용은 같은 귀속·같은 시점·같은 범위를 말한다(비교 전제)", () => {
    const record = fixture.recorded.contradictionLabel["story-demo-2-conflict:c-2"];
    expect(record?.pairs).toEqual([
      expect.objectContaining({ label: "양립 불가", a: "q-m-2", b: "q-h-2" }),
    ]);
    const quotes = Object.values(fixture.recorded.evidenceExtract).flatMap((r) => r.quotes);
    const a = quotes.find((q) => q.quoteId === "q-m-2")?.quote ?? "";
    const b = quotes.find((q) => q.quoteId === "q-h-2")?.quote ?? "";
    for (const quote of [a, b]) {
      expect(quote).toMatch(/port authority/);
      expect(quote).toMatch(/Tuesday/);
    }
  });
  it("정정은 들어 있지 않다(M3 데모 ③)", () => {
    for (const article of fixture.articles) {
      expect(article.rawBody).not.toMatch(/correction|corrected|retract/i);
    }
  });
});
