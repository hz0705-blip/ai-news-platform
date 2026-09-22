/** @jsxImportSource react */
import type { ContradictionStatus } from "@newsplatform/domain";
import { CheckCheck, CircleCheck, FilePenLine, FileText, TriangleAlert } from "lucide-react";
import { Badge } from "./ui/badge.tsx";

const states = {
  "단일 출처": { variant: "single", Icon: FileText },
  "복수 출처 일치": { variant: "agree", Icon: CheckCheck },
  "보도 상충": { variant: "conflicting", Icon: TriangleAlert },
  "상충 해소": { variant: "resolved", Icon: CircleCheck },
  정정됨: { variant: "corrected", Icon: FilePenLine },
} as const;

export function StatusBadge({ status }: { status: ContradictionStatus }) {
  const { variant, Icon } = states[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      <span>{status}</span>
    </Badge>
  );
}
