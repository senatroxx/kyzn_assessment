import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

type AlertVariant = "default" | "destructive";
type AlertProps = HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant };

const variants: Record<AlertVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  destructive: "border-destructive/50 bg-card text-destructive",
};

export function Alert({
  className,
  variant = "default",
  ...props
}: AlertProps) {
  return (
    <div
      data-slot="alert"
      className={cn(
        "relative w-full rounded-sm border px-4 py-3 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

export type { AlertProps, AlertVariant };
