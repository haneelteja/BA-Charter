import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:hover:bg-indigo-600 focus-visible:outline-indigo-600",
  secondary:
    "border border-surface-border bg-surface text-foreground shadow-sm hover:bg-indigo-50 hover:border-indigo-200 dark:hover:bg-indigo-950/40 dark:hover:border-indigo-900",
  ghost: "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
  danger:
    "border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50 dark:border-red-900/60 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}
