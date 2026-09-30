import { describe, expect, it } from "vitest";
import type { Claim } from "./claim.ts";
import type { ContradictionStatus } from "./contradiction-status.ts";
import type { Evidence } from "./evidence.ts";
import { type ArticleVersionRecord, deriveReprocessContext } from "./reprocess-context.ts";
import type { Revision } from "./revision.ts";

const t = (hour: number) => new Date(Date.UTC(2026, 8, 29, hour));

const evidence = (claimId: string, articleId: string, articleVersionId: string): Evidence => ({
  id: `${claimId}:${articleVersionId}`,
  claimId,
  articleId,
  articleVersionId,
  sourceId: "src",
  span: { start: 0, end: 4 },
  offsetUnit: "code-point",
  normalizationVersion: 1,
  spanText: "Body",
  spanHash: "h",
  excerpt: "Body",
  excerptSpan: { start: 0, end: 4 },
  highlightInExcerpt: { start: 0, end: 4 },
  sourceUrl: "https://x.invalid/",
  verifiedAt: t(0),
});

const claim = (
  id: string,
  status: ContradictionStatus,
  refs: readonly (readonly [articleId: string, articleVersionId: string])[],
): Claim => ({
  id,
  text: `${id} 문장`,
  claimType: "보도된 사실",
  modality: "단정",
  order: 0,
  contradictionStatus: status,
  evidence: refs.map(([articleId, versionId]) => evidence(id, articleId, versionId)),
});

const revision = (revisionNumber: number, claims: readonly Claim[]): Revision => ({
  id: `s:rev-${revisionNumber}`,
  storyId: "story-s",
  revisionNumber,
  title: "제목",
  publishedAt: t(revisionNumber),
  contradictionStatus: "단일 출처",
  promptVersions: {
    evidenceExtract: "e@1",
    claimGenerate: "c@1",
    gate: "g@1",
    contradictionLabel: "l@1",
  },
  modelId: "recorded",
  claims,
  sources: [],
});

const version = (
  articleId: string,
  articleVersionId: string,
  capturedAt: Date,
  correctionCandidate = false,
): ArticleVersionRecord => ({
  articleId,
  articleVersionId,
  body: `body of ${articleVersionId}`,
  capturedAt,
  correctionCandidate,
});

describe("deriveReprocessContext (#86·#90·#94)", () => {
  it("정정 후보 버전은 그 버전이 생긴 뒤 첫 재처리에서만 첫 재처리로 표시된다", () => {
    const latest = revision(1, [claim("s:c-1", "단일 출처", [["a-1", "v1"]])]);
    const versions = [version("a-1", "v1", t(0)), version("a-1", "v2", t(3), true)];
    const at = (latestCheckedAt: Date | undefined) =>
      deriveReprocessContext({
        latestRevision: latest,
        latestCheckedAt,
        claimHistory: [latest.claims],
        articleVersions: versions,
      }).currentVersions.get("a-1");

    // 마지막 확인(t2) 뒤에 수집된 정정 후보 버전: 첫 재처리. 미룬·실패한 배치는 확인 시각을 바꾸지 않아 여전히 참이다.
    expect(at(t(2))).toEqual({
      articleVersionId: "v2",
      body: "body of v2",
      correctionCandidate: true,
      correctionFirstReprocess: true,
    });
    // 그 버전을 본 배치가 확인·발행한 뒤(t4)의 재처리: 정정 후보 표시만 남는다.
    expect(at(t(4))).toEqual({
      articleVersionId: "v2",
      body: "body of v2",
      correctionCandidate: true,
    });
    // 개정판이 없는 사건은 항상 첫 재처리다.
    expect(
      deriveReprocessContext({
        latestRevision: undefined,
        latestCheckedAt: undefined,
        claimHistory: [],
        articleVersions: versions,
      }).currentVersions.get("a-1")?.correctionFirstReprocess,
    ).toBe(true);
    // 정정 후보가 아닌 버전은 둘 다 없다.
    const plain = deriveReprocessContext({
      latestRevision: latest,
      latestCheckedAt: t(2),
      claimHistory: [latest.claims],
      articleVersions: [version("a-1", "v1", t(0)), version("a-1", "v3", t(3))],
    }).currentVersions.get("a-1");
    expect(plain).toEqual({ articleVersionId: "v3", body: "body of v3" });
  });

  it("이전 본문은 최신 개정판과 열린 에피소드 근거의 버전이다", () => {
    // 개정판 1: c-2 보도 상충(a-2 v2a 근거). 개정판 2: c-2가 빠짐, c-1은 a-1 v1a 근거.
    const episode = claim("s:c-2", "보도 상충", [["a-2", "v2a"]]);
    const rev1 = revision(1, [claim("s:c-1", "단일 출처", [["a-1", "v1a"]]), episode]);
    const rev2 = revision(2, [claim("s:c-1", "단일 출처", [["a-1", "v1a"]])]);
    const context = deriveReprocessContext({
      latestRevision: rev2,
      latestCheckedAt: t(2),
      claimHistory: [rev1.claims, rev2.claims],
      articleVersions: [
        version("a-1", "v1a", t(0)),
        version("a-1", "v1b", t(3)),
        version("a-2", "v2a", t(0)),
        version("a-2", "v2b", t(3)),
        // 어떤 근거도 가리키지 않는 옛 버전은 넘기지 않는다.
        version("a-3", "v3a", t(0)),
        version("a-3", "v3b", t(3)),
      ],
    });
    expect(context.latestRevision).toBe(rev2);
    expect(context.openEpisodeClaims).toEqual([episode]);
    expect(context.previousVersionBodies).toEqual([
      { articleVersionId: "v1a", body: "body of v1a" },
      { articleVersionId: "v2a", body: "body of v2a" },
    ]);
    expect([...context.currentVersions].map(([id, v]) => [id, v.articleVersionId])).toEqual([
      ["a-1", "v1b"],
      ["a-2", "v2b"],
      ["a-3", "v3b"],
    ]);

    // 근거 버전이 곧 입력 버전이면 이전 본문이 없다.
    const unchanged = deriveReprocessContext({
      latestRevision: rev2,
      latestCheckedAt: t(2),
      claimHistory: [rev1.claims, rev2.claims],
      articleVersions: [version("a-1", "v1a", t(0)), version("a-2", "v2a", t(0))],
    });
    expect(unchanged.previousVersionBodies).toBeUndefined();
    expect(unchanged.openEpisodeClaims).toEqual([episode]);
  });

  it("본문 없는 기사 버전에서는 새 근거를 뽑지 않는다", () => {
    // 보존 기한이 지나 본문을 지운 버전(#144): a-1은 마지막 버전의 본문이 없어 입력이 아니고,
    // a-2의 옛 근거 버전은 본문이 없어 좌표 정렬용 이전 본문으로도 넘기지 않는다.
    const latest = revision(1, [
      claim("s:c-1", "단일 출처", [["a-1", "v1a"]]),
      claim("s:c-2", "단일 출처", [["a-2", "v2a"]]),
    ]);
    const deleted = (record: ArticleVersionRecord): ArticleVersionRecord => ({
      ...record,
      body: null,
    });
    const context = deriveReprocessContext({
      latestRevision: latest,
      latestCheckedAt: t(2),
      claimHistory: [latest.claims],
      articleVersions: [
        deleted(version("a-1", "v1a", t(0))),
        deleted(version("a-2", "v2a", t(0))),
        version("a-2", "v2b", t(3)),
      ],
    });
    expect([...context.currentVersions].map(([id, v]) => [id, v.articleVersionId])).toEqual([
      ["a-2", "v2b"],
    ]);
    expect(context.previousVersionBodies).toBeUndefined();
  });

  it("본문이 지워진 기사에만 근거가 있던 주장은 옮겨 싣는 주장이다", () => {
    const only = claim("s:c-1", "단일 출처", [["a-1", "v1"]]);
    const mixed = claim("s:c-2", "복수 출처 일치", [
      ["a-1", "v1"],
      ["a-2", "v2"],
    ]);
    const live = claim("s:c-3", "단일 출처", [["a-2", "v2"]]);
    const latest = revision(1, [only, mixed, live]);
    const context = deriveReprocessContext({
      latestRevision: latest,
      latestCheckedAt: t(2),
      claimHistory: [latest.claims],
      articleVersions: [{ ...version("a-1", "v1", t(0)), body: null }, version("a-2", "v2", t(0))],
    });
    expect(context.carriedClaims).toEqual([only]);
  });
});
