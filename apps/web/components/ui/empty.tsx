/** @jsxImportSource react */
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

// shadcn 4.21.0 base-nova에서 필요한 텍스트 전용 조합만 유지한다.
export function Empty({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-col items-center gap-4 rounded-md border border-dashed border-border p-6 text-center",
        className,
      )}
      {...props}
    />
  );
}
export function EmptyHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="empty-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}
export function EmptyTitle(props: ComponentProps<"p">) {
  return <p data-slot="empty-title" {...props} />;
}
export function EmptyDescription(props: ComponentProps<"p">) {
  return <p data-slot="empty-description" className="text-meta text-muted-foreground" {...props} />;
}
export function EmptyContent(props: ComponentProps<"div">) {
  return <div data-slot="empty-content" {...props} />;
}
