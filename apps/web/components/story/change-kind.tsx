/** @jsxImportSource react */
import type { ChangeKind } from "@newstrail/domain";
import { ArrowRightLeft, FileDiff, type LucideIcon, Newspaper, PencilLine } from "lucide-react";
import type { ReactNode } from "react";

/** 변화 종류별 아이콘. 글자 라벨과 함께만 쓴다(색만으로 부호화하지 않는다). */
export const CHANGE_KIND_ICONS: Readonly<Record<ChangeKind, LucideIcon>> = {
  "주장 추가·삭제·수정": PencilLine,
  "상충 상태 변화": ArrowRightLeft,
  "원문 변경": FileDiff,
  "출처 추가": Newspaper,
};

/** 변화 종류 표지: 아이콘 + 글자. */
export function KindLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold [&>svg]:size-4 [&>svg]:shrink-0">
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
