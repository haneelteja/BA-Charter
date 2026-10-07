import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "indigo" | "green" | "amber" | "red";

const TONES: Record<Tone, string> = {
  neutral: "bg-black/5 text-foreground/70 dark:bg-white/10 dark:text-foreground/70",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}
