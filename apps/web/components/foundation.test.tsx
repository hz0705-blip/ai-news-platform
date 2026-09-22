import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DemoBadge } from "./demo-badge.tsx";
import { EvidenceHighlight } from "./evidence-highlight.tsx";
import { SourceTile } from "./source-tile.tsx";
import { StatusBadge } from "./status-badge.tsx";
import { Button } from "./ui/button.tsx";

afterEach(cleanup);

it.each(["단일 출처", "복수 출처 일치", "보도 상충", "상충 해소", "정정됨"] as const)(
  "%s는 색·아이콘 없이도 정확한 상태 라벨을 읽을 수 있다",
  (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(status).textContent).toBe(status);
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  },
);

it("데모 사건·근거 구간 라벨과 영어 원문 언어를 보존한다", () => {
  render(
    <>
      <DemoBadge />
      <EvidenceHighlight lang="en">The report may change.</EvidenceHighlight>
    </>,
  );
  expect(screen.getByText("데모 사건")).toBeDefined();
  expect(screen.getByText("근거 구간").getAttribute("lang")).toBe("ko");
  const evidence = screen.getByText("The report may change.");
  expect(evidence.tagName).toBe("MARK");
  expect(evidence.closest('[lang="en"]')).not.toBeNull();
});

it("출처명 전체를 읽으며 첫 글자 타일은 중복 낭독하지 않는다", () => {
  render(<SourceTile name="가상 출처 A" />);
  expect(screen.getByText("가상 출처 A")).toBeDefined();
  expect(screen.getByText("가").getAttribute("aria-hidden")).toBe("true");
});

it("Base UI 버튼은 이름·클릭·비활성 동작을 보존한다", () => {
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>더 보기</Button>);
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(onClick).toHaveBeenCalledOnce();
  rerender(
    <Button onClick={onClick} disabled>
      더 보기
    </Button>,
  );
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  expect(onClick).toHaveBeenCalledOnce();
});
