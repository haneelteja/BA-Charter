"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldStyles =
  "w-full rounded-lg border border-surface-border bg-surface px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted/70 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

/** Password <input> with a show/hide toggle — the only password field variant that needs client interactivity, so it's split out from the plain server-renderable Input. */
export function PasswordInput({
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        className={cn(fieldStyles, className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-muted transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
