/** @jsxImportSource react */
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

// shadcn 4.21.0 base-nova Alert에서 필요한 조합만 유지한다. 원본의 기본 `role="alert"`은 두지 않는다 —
// 페이지와 함께 렌더링되는 운영 상태는 실질 변화 알림이 아니다(스펙 "화면별 상태 원칙").
export function Alert({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert"
      className={cn(
        "grid w-full grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-md border border-border bg-card px-4 py-3 text-left text-card-foreground [&>svg]:row-span-2 [&>svg]:size-4 [&>svg]:translate-y-1",
        className,
      )}
      {...props}
    />
  );
}
export function AlertTitle({ className, ...props }: ComponentProps<"p">) {
  return (
    <p data-slot="alert-title" className={cn("col-start-2 font-semibold", className)} {...props} />
  );
}
export function AlertDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-description"
      className={cn("col-start-2 text-meta text-muted-foreground", className)}
      {...props}
    />
  );
}
