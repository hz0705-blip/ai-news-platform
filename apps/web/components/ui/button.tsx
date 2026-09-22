/** @jsxImportSource react */
"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

// shadcn 4.21.0 / base-nova: #20의 색·줄바꿈·포커스 계약에 맞춘 최소 variant.
const buttonVariants = cva(
  "inline-flex max-w-full items-center justify-center gap-2 rounded-md border border-transparent px-4 py-2 text-body font-medium whitespace-normal disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Button({
  className,
  variant,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
