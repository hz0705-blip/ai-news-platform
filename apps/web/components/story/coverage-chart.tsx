/** @jsxImportSource react */
import {
  COVERAGE_BIN_COLUMN,
  COVERAGE_COUNT_COLUMN,
  COVERAGE_HEADING,
  COVERAGE_OBSERVED_COLUMN,
  coverageCaption,
  coverageObservedNote,
  SHOW_TABLE,
} from "../../app/story/copy.ts";
import { formatKstBin } from "../../lib/format-time.ts";
import type { CoverageView } from "../../lib/story-view.ts";
import { CoverageBars } from "./coverage-bars.tsx";

/**
 * 보도량 추이: 기사 발행 시각(모르면 관측 시각) 기준 KST 구간별 기사 수. 빈 구간은 0이다.
 * 같은 데이터의 표를 `<figure>` 안에서 펼칠 수 있다(스펙 "시각화(1차)").
 */
export function CoverageChart({ coverage }: { coverage: CoverageView }) {
  const rows = coverage.bins.map((bin) => ({
    ...bin,
    ...formatKstBin(bin.start, coverage.binSize),
  }));
  const hasObserved = coverage.observedTotal > 0;
  return (
    <figure aria-labelledby="coverage-heading" className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <h3 id="coverage-heading">{COVERAGE_HEADING}</h3>
        <span className="text-meta text-muted-foreground">{coverageCaption(coverage.binSize)}</span>
        {hasObserved ? (
          <span className="text-meta text-muted-foreground">
            {coverageObservedNote(coverage.observedTotal)}
          </span>
        ) : null}
      </figcaption>
      <CoverageBars data={rows.map((row) => ({ tick: row.tick, count: row.count }))} />
      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer">{SHOW_TABLE}</summary>
        <table className="mt-2 w-full border-collapse text-meta">
          <caption className="sr-only">{COVERAGE_HEADING}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="p-2">
                {COVERAGE_BIN_COLUMN}
              </th>
              <th scope="col" className="p-2">
                {COVERAGE_COUNT_COLUMN}
              </th>
              {hasObserved ? (
                <th scope="col" className="p-2">
                  {COVERAGE_OBSERVED_COLUMN}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.start.toISOString()} className="border-b border-border">
                <th scope="row" className="p-2 text-left font-normal">
                  <time dateTime={row.start.toISOString()}>{row.full}</time>
                </th>
                <td className="p-2">{row.count}</td>
                {hasObserved ? <td className="p-2">{row.observedCount}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
