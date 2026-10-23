import type { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-sm bg-[#31634c] px-4 py-2 text-sm font-medium text-white hover:bg-[#254d3a] ${className}`}
      {...props}
    />
  );
}
