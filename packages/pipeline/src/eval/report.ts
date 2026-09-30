import { LABEL_SOURCES, type Label } from "./adjudicate.ts";
import { ITEM_KINDS, type KindStats } from "./compare.ts";
import type { Score } from "./score.ts";

/**
 * 평가 리포트 `docs/eval/report.md`(#149). 수치·분모·구간·비용·미처리만 쓰고 기사 문장·주장 문장은 쓰지 않는다
 * (쓰기 전 `assertNoArticleText`). 표 모양은 Ruling이다.
 */

export interface ReportMeta {
  readonly runId: string;
  readonly createdAt: string;
  readonly modelId: string;
  readonly embeddingModel: string;
  readonly promptVersions: Readonly<Record<string, string>>;
  readonly judgeModel: string;
  readonly judgePromptVersion: string;
  readonly spend: {
    readonly pipelineUsd: number;
    readonly judgeUsd: number;
    readonly totalUsd: number;
    readonly capUsd: number;
  };
  readonly unprocessed: {
    readonly articles: number;
    readonly stories: readonly { readonly storyId: string; readonly reason: string }[];
    readonly judgeNotCalled: readonly string[];
    readonly judgeFailed: readonly string[];
    readonly packetsWithoutJudgeTask: readonly string[];
    readonly stoppedByBudget: boolean;
  };
}

/** `packages/pipeline/eval/agreement.json`에서 쓰는 부분. */
export interface AgreementSummary {
  readonly models: Readonly<Record<string, string>>;
  readonly byKind: Readonly<Record<string, KindStats>>;
  readonly overall: {
    readonly items: number;
    readonly agreementRate: number | null;
    readonly disagreementRate: number | null;
    readonly abstentionRate: Readonly<Record<string, number | null>>;
  };
}

const KIND_NAMES: Readonly<Record<string, string>> = {
  pair: "기사 쌍 같은 사건 여부",
  claim: "주장",
  support: "근거 뒷받침",
  relation: "상충 관계",
  status: "사건 상태",
};

const num = (value: number | null | undefined, digits = 3) =>
  value === null || value === undefined ? "N/A" : value.toFixed(digits);
const usd = (value: number | null) => (value === null ? "N/A" : `$${value.toFixed(4)}`);
const table = (header: readonly string[], rows: readonly (readonly string[])[]) =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

export function renderReport(
  score: Score,
  meta: ReportMeta,
  agreement: AgreementSummary,
  labels: readonly Label[],
): string {
  const labelRows = ITEM_KINDS.map((kind) => {
    const of = labels.filter((l) => l.kind === kind);
    return [
      KIND_NAMES[kind] ?? kind,
      String(of.length),
      ...LABEL_SOURCES.map((source) => String(of.filter((l) => l.labelSource === source).length)),
      String(of.filter((l) => l.value === null).length),
    ];
  });
  const agreementRows = ITEM_KINDS.map((kind) => {
    const s = agreement.byKind[kind];
    return [
      KIND_NAMES[kind] ?? kind,
      String(s?.items ?? 0),
      num(s?.agreementRate),
      num(s?.disagreementRate),
      num(s?.abstentionRate.A),
      num(s?.abstentionRate.B),
      num(s?.kappa),
      String(s?.kappaItems ?? 0),
    ];
  });
  const metricRows = score.rows.map((r) => [
    r.group,
    r.name,
    num(r.value),
    r.denominator,
    r.interval === null
      ? "N/A"
      : `[${num(r.interval.low)}, ${num(r.interval.high)}] (n=${r.interval.resamples})`,
  ]);
  const statusRows = score.status.goldClasses.map((gold) => [
    gold,
    ...score.status.predClasses.map((pred) => String(score.status.matrix[gold]?.[pred] ?? 0)),
  ]);
  const relationRows = Object.entries(score.relation).map(([label, s]) => [
    label,
    `${num(s.precision.value)} (${s.precision.numerator}/${s.precision.denominator})`,
    `${num(s.recall.value)} (${s.recall.numerator}/${s.recall.denominator})`,
    num(s.f1),
  ]);
  const { unprocessed } = meta;
  const failures = Object.entries(score.failuresByStage);
  const flipRate = score.judge.flipUnion === 0 ? null : score.judge.flipped / score.judge.flipUnion;

  return `# 평가 리포트

> **개발셋(패킷 ${score.packets}개) 측정이다. 홀드아웃이 아니며 헤드라인 수치가 아니다.** 개발셋은 임계값·프롬프트 조정용이고, 표본이 작아 구간이 넓다.

- 실행 \`${meta.runId}\` (${meta.createdAt}), 파이프라인 모델 \`${meta.modelId}\`, 임베딩 \`${meta.embeddingModel}\`, 프롬프트 ${Object.values(
    meta.promptVersions,
  )
    .map((v) => `\`${v}\``)
    .join(" · ")}
- 주장 매칭 판정자 \`${meta.judgeModel}\`(\`${meta.judgePromptVersion}\`)
- 정답 라벨: 동일 계열 두 모델 교차 검증, 단일 어노테이터(\`${Object.values(agreement.models).join("`·`")}\` 초안, 운영자 1인 판정).
- 기사 문장·주장 문장은 싣지 않는다. 수치·분모·구간만 있다.

## 라벨 구성

모델 합의는 사람 검증이 아님. 라벨 구성 방법일 뿐이다.

두 초안 모델의 합의·불일치·기권(\`agreement.json\`, 항목 ${agreement.overall.items}개, 전체 합의율 ${num(agreement.overall.agreementRate)}, 불일치율 ${num(agreement.overall.disagreementRate)}):

${table(["항목", "수", "합의율", "불일치율", "기권율 A", "기권율 B", "카파", "카파 항목"], agreementRows)}

라벨 출처별 수(\`labels.json\`, "정답에서 뺌"은 판정 불가·빼기로 판정해 값이 없는 항목):

${table(["항목", "라벨", ...LABEL_SOURCES, "정답에서 뺌"], labelRows)}

## 지표

기사 ${score.articles}건(배정 ${score.assignedArticles}건), 정답 사건 ${score.goldStories}개, 예측 사건 ${score.predictedStories}개. 구간은 사건 패킷 단위 부트스트랩(시드 \`eval-bootstrap@1\`, 재표집 1,000회, 95% 백분위)이며 n은 값이 정의된 재표집 수다. 분모가 0이면 N/A.

${table(["묶음", "지표", "값", "분모", "95% 구간"], metricRows)}

### 사건 상태 혼동행렬(행 정답, 열 예측)

${table(["정답 \\ 예측", ...score.status.predClasses], statusRows)}

### 상충 관계 클래스별 정밀도·재현율·F1

정답 관계 쌍 중 대응하는 파이프라인 인용 쌍이 없는 것 ${score.relationUnaligned}개는 뺐다.

${table(["클래스", "정밀도", "재현율", "F1"], relationRows)}

### 주장 매칭(판정자)

판정 과제 ${score.judge.tasks}개 패킷 중 ${score.judge.judged}개 판정. 순서 뒤집기 재판정 ${score.judge.flipPackets}개 패킷, 위치 뒤집힘 비율 ${num(flipRate)} (매칭 쌍 합집합 ${score.judge.flipUnion}개 중 ${score.judge.flipped}개가 한쪽 순서에만 있음). 2단계 게이트·상충 관계 지표는 판정자가 짝지은 주장에서만 센다.

## 비용과 미처리

${table(
  ["항목", "값"],
  [
    [
      "파이프라인(모델 + 임베딩)",
      `${usd(meta.spend.pipelineUsd)} (모델 ${usd(score.cost.modelUsd)}, 임베딩 ${usd(score.cost.embeddingUsd)})`,
    ],
    ["판정자", usd(meta.spend.judgeUsd)],
    ["합계 / 상한", `${usd(meta.spend.totalUsd)} / $${meta.spend.capUsd.toFixed(2)}`],
    ["사건 패킷당 파이프라인 비용", `${usd(score.cost.perStoryUsd)} (패킷 ${score.packets})`],
    ["기사당 파이프라인 비용", `${usd(score.cost.perArticleUsd)} (기사 ${score.articles})`],
    [
      "배치 시간 p50 / p95",
      `${num(score.time.p50Ms === null ? null : score.time.p50Ms / 1000, 1)}초 / ${num(score.time.p95Ms === null ? null : score.time.p95Ms / 1000, 1)}초 (슬롯 ${score.time.slots}개, 배정 + 배치)`,
    ],
  ],
)}

미처리:

- 예산 상한으로 멈춤: ${unprocessed.stoppedByBudget ? "예" : "아니오"}. 배정하지 않은 기사 ${unprocessed.articles}건.
- 마지막 입력이 반영되지 않은 사건 ${unprocessed.stories.length}개${unprocessed.stories.length === 0 ? "" : `: ${unprocessed.stories.map((s) => `\`${s.storyId}\`(${/^[a-z-]+ \[/.exec(s.reason)?.[0]?.replace(" [", "") ?? s.reason})`).join(", ")}`}.
- 단계별 사건 실패(슬롯 합계): ${failures.length === 0 ? "없음" : failures.map(([stage, n]) => `${stage} ${n}`).join(", ")}.
- 판정 과제가 없는 패킷(예측 사건에 개정판이 없거나 정답 주장이 없음) ${unprocessed.packetsWithoutJudgeTask.length}개${unprocessed.packetsWithoutJudgeTask.length === 0 ? "" : `: ${unprocessed.packetsWithoutJudgeTask.join(", ")}`}.
- 상한으로 호출하지 않은 판정 ${unprocessed.judgeNotCalled.length}개${unprocessed.judgeNotCalled.length === 0 ? "" : `: ${unprocessed.judgeNotCalled.join(", ")}`}, 실패한 판정 ${unprocessed.judgeFailed.length}개${unprocessed.judgeFailed.length === 0 ? "" : `: ${unprocessed.judgeFailed.join(", ")}`}.

## 만들지 않은 지표

| 지표 | 이유 |
| --- | --- |
| 주장 매칭 링크 F1·5분류 macro-F1 | 개정판 사이 주장 매칭 정답 라벨이 개발셋에 없다(판정자 매칭은 채점 정렬용이다). |
| 시간 갱신 오탐율·침묵 오판 | 원문 재수집(새 기사 버전) 사례가 개발셋에 없다. |
| 휴면 재개 | 개발셋 기사가 72시간 안에 모여 휴면 뒤 재개 사례가 없다. |
| 첫 사건 감지 | 사건의 첫 기사 여부 정답 라벨이 없다. |
| 후보 recall@K | 배정 후보 목록 기록과 정답 사건이 후보에 들어야 하는 사례 라벨이 없다. |
| 인용 링크 정밀도·완전성 | 이번 리포트 범위 밖(#149). 정답 주장의 근거 좌표는 있으나 두 초안의 인용 선택이 크게 갈려(주장 항목 합의율이 낮다) 완전성 분모를 믿기 어렵다. |
| 상태 전이 정확도 | 정답 상태가 패킷당 하나뿐이라 전이 사례가 없다. |

## 측정 방법

- 도착 스트림: 20개 패킷의 기사를 한 스트림으로 섞어 발행 시각 뒤 첫 05·17시 KST 슬롯에 넣는다(슬롯 시각에 발행된 기사는 그 슬롯). 슬롯마다 운영과 같은 사건 배정(임베딩·후보·임계값) → 입력이 바뀐 사건만 배치(\`runBatch\`)를 돈다. 사건 상태(배정 후보, 최신 개정판, 주장 이력)는 메모리로 슬롯 사이에 잇는다. 실패한 사건은 다음 슬롯에서 다시 처리한다.
- 정답 분할은 패킷 소속이며, 판정된 기사 쌍 라벨이 다른 패킷 기사를 "같은 사건"이라 하면 두 패킷을 합친다. 패킷의 예측 사건은 그 패킷 기사가 가장 많이 배정된 사건이다.
- 사건 배정 정확도·거짓 병합·거짓 분리는 판정된 기사 쌍(값이 "같은 사건"·"다른 사건"인 것)에서 센다. 부트스트랩에서 두 패킷에 걸친 쌍의 가중치는 두 패킷 표집 수의 곱이다.
- 1단계 유효 구간율: 최종 개정판의 근거마다 패킷 본문으로 \`checkEvidenceSpan\`을 다시 돌리고 구간 원문이 같은지 본다. 발행 근거 중 무효는 0건이어야 한다.
- 2단계: 판정자가 짝지은 주장 쌍에서, 파이프라인 인용과 문장을 공유하는 정답 뒷받침 라벨(판정 불가·빈 값 제외)을 짝짓는다. 양성은 "뒷받침". 기권율은 예측 사건 최종 처리의 2단계 판정 전체에서 센다.
- 상충 관계: 짝지은 주장에서 정답 인용 쌍과 양쪽 문장이 대응하는 파이프라인 인용 쌍의 라벨을 비교한다.
- 사건 상태: 패킷 정답 상태와 예측 사건 최종 개정판의 상태. 개정판이 없으면 "미처리".
- 판정자: 목록 두 개의 A·B 배정, 항목 순서, 근거 순서를 시드(\`eval-judge@1\`)로 섞고 어느 목록이 모델 출력인지, 어느 매체 기사인지 보이지 않는다. 판정한 패킷의 20%(올림)를 항목·근거 순서를 뒤집어 다시 판정한다.
- 비용 상한: 실행 + 판정 합계 $${meta.spend.capUsd.toFixed(2)}. 호출 전 예약이 상한을 넘으면 호출하지 않고 남은 것을 미처리로 적는다.

## 재현

\`\`\`sh
# EVAL_DATA_DIR(저장소 밖, 패킷·초안이 있는 곳)과 OPENAI_API_KEY가 필요하다. 산출물은 EVAL_DATA_DIR/runs/<runId>/.
pnpm --filter @newstrail/pipeline eval:run            # 도착 스트림 실행(실제 호출, 상한 안에서)
pnpm --filter @newstrail/pipeline eval:score <runId>  # 판정자 호출(결과는 캐시) + 채점 + 이 파일
# 유료 호출 없이 경로만 점검: 두 명령에 --offline
\`\`\`
`;
}
