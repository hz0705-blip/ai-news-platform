/** @jsxImportSource react */
import type { ContradictionStatus } from "@newsplatform/domain";
import { CheckCheck, CircleCheck, FilePenLine, FileText, TriangleAlert } from "lucide-react";
import { STATUS_DESCRIPTION } from "../app/story/copy.ts";
import { Badge } from "./ui/badge.tsx";

const states = {
  "단일 출처": { variant: "single", Icon: FileText },
  "복수 출처 일치": { variant: "agree", Icon: CheckCheck },
  "보도 상충": { variant: "conflicting", Icon: TriangleAlert },
  "상충 해소": { variant: "resolved", Icon: CircleCheck },
  정정됨: { variant: "corrected", Icon: FilePenLine },
} as const;

/**
 * 상충 상태 배지. 아이콘과 글자 라벨을 함께 쓴다(색만으로 구분하지 않는다).
 * `description`: 사건 머리는 설명 문구를 보이게("visible"), 주장 배지는 스크린리더 전용("sr-only")으로 붙인다.
 */
export function StatusBadge({
  status,
  description = "none",
}: {
  status: ContradictionStatus;
  description?: "visible" | "sr-only" | "none";
}) {
  const { variant, Icon } = states[status];
  const badge = (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      <span>{status}</span>
    </Badge>
  );
  if (description === "none") return badge;
  return (
    <>
      {badge}
      <span className={description === "visible" ? "text-meta text-muted-foreground" : "sr-only"}>
        {STATUS_DESCRIPTION[status]}
      </span>
    </>
  );
}
