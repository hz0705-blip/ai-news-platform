import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
import { DEMO_REFERENCE_TIME, loadDemoStoryFixture } from "./fixtures.ts";

const fixture = loadDemoStoryFixture("demo-1-agreement");

describe("데모 사건 ① 픽스처", () => {
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

  it("골든셋에는 항목이 하나만 등록돼 있다", () => {
    const goldenSetPath = fileURLToPath(new URL("../fixtures/golden-set.json", import.meta.url));
    const goldenSet = JSON.parse(readFileSync(goldenSetPath, "utf8")) as unknown[];
    expect(goldenSet.length).toBe(1);
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
