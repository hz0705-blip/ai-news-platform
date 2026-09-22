/** @jsxImportSource react */
// 공개 라우트가 아닌 브라우저 검사 입력. 실제 컴포넌트의 마크업을 사용한다.
import { renderToStaticMarkup } from "react-dom/server";
import { DemoBadge } from "../components/demo-badge.tsx";
import { EvidenceHighlight } from "../components/evidence-highlight.tsx";
import { SourceTile } from "../components/source-tile.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { Button } from "../components/ui/button.tsx";

export function typographyFixture(): string {
  return renderToStaticMarkup(
    <section aria-label="타이포 유틸 검사">
      <Button>본문 크기</Button>
      <p className="text-body">본문 유틸 크기</p>
      <p className="text-card-title">카드 제목 크기</p>
      <p className="text-section">구획 제목 크기</p>
      <p className="text-title">제목 크기</p>
    </section>,
  );
}

export function componentFixture(): string {
  return renderToStaticMarkup(
    <section aria-label="기본 컴포넌트 검사" className="flex flex-col items-start gap-4">
      <h1>기본 컴포넌트</h1>
      {(["단일 출처", "복수 출처 일치", "보도 상충", "상충 해소", "정정됨"] as const).map(
        (status) => (
          <StatusBadge key={status} status={status} />
        ),
      )}
      <DemoBadge />
      <EvidenceHighlight lang="en">
        The report may change. https://example.test/{"longmixed한글".repeat(20)}
      </EvidenceHighlight>
      <SourceTile name="가상 출처 A" />
      <Button>근거를 살펴보고 원문에서 다시 확인하기</Button>
      <a href="#evidence">근거 구간으로 이동</a>
    </section>,
  );
}
