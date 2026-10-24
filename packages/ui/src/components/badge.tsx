import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant };

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground",
  outline: "border-border bg-transparent text-foreground",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex min-h-6 items-center rounded-sm border px-2 py-0.5 text-xs font-medium leading-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export type { BadgeProps, BadgeVariant };
