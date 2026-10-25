import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      data-slot="input"
      type={type}
      className={cn(
        "flex min-h-11 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground shadow-none outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#6b6b6b] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
        className,
      )}
      {...props}
    />
  );
});
