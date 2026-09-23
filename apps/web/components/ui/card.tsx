/** @jsxImportSource react */
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils.ts";

// shadcn 4.21.0 base-nova 최소 조합. B 토큰·타이포·4px 반경을 우선한다.
export function Card({ className, ...props }: ComponentProps<"article">) {
  return (
    <article
      data-slot="card"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-4 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header data-slot="card-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}
export function CardTitle(props: ComponentProps<"h3">) {
  return <h3 data-slot="card-title" {...props} />;
}
export function CardContent(props: ComponentProps<"div">) {
  return <div data-slot="card-content" {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<"footer">) {
  return (
    <footer
      data-slot="card-footer"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
