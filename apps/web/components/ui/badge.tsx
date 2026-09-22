/** @jsxImportSource react */
"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

// shadcn 4.21.0 / base-nova: 상충 상태는 조작색 variant와 분리한다.
const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-md border border-transparent px-2 py-1 text-meta leading-normal font-medium whitespace-normal [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        single: "bg-status-single text-status-single-foreground",
        agree: "bg-status-agree text-status-agree-foreground",
        conflicting: "bg-status-conflicting text-status-conflicting-foreground",
        resolved: "bg-status-resolved text-status-resolved-foreground",
        corrected: "bg-status-corrected text-status-corrected-foreground",
        demo: "border-dashed border-demo-foreground bg-demo text-demo-foreground",
      },
    },
    defaultVariants: { variant: "single" },
  },
);

function Badge({
  className,
  variant = "single",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, badgeVariants };
