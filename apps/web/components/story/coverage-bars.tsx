/** @jsxImportSource react */
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

/** 막대 높이(px). 폭은 컨테이너를 따르고 높이는 고정해 서버 렌더링 크기가 결정론적이다. */
export const COVERAGE_CHART_HEIGHT = 200;

/**
 * 보도량 추이 막대(Recharts 3). 애니메이션·툴팁·키보드 레이어를 끈다 — 값은 같은 `<figure>`의 표가 전한다.
 * 색은 디자인 토큰(글자색 상속 `currentColor`, 격자 `--border`)만 쓴다.
 */
export function CoverageBars({
  data,
}: {
  data: readonly { readonly tick: string; readonly count: number }[];
}) {
  return (
    <div aria-hidden="true" className="text-muted-foreground">
      <BarChart
        responsive
        data={[...data]}
        style={{ width: "100%", height: COVERAGE_CHART_HEIGHT }}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        accessibilityLayer={false}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="tick"
          tick={{ fill: "currentColor", fontSize: 12 }}
          stroke="currentColor"
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: "currentColor", fontSize: 12 }}
          stroke="currentColor"
        />
        <Bar dataKey="count" fill="currentColor" isAnimationActive={false} />
      </BarChart>
    </div>
  );
}
