"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Button, type Size, type Variant } from "./Button";

/**
 * A <Button type="submit"> that goes into a disabled, labeled "in progress"
 * state for the duration of its enclosing form's Server Action — plain
 * server-rendered forms otherwise give no feedback at all while the action
 * runs (no spinner, no disabling), which reads as a stuck/unresponsive
 * button on any action slow enough to notice (e.g. the outbound email
 * send on sign-up/magic-link/password-reset).
 *
 * Must render inside the <form> it's reporting on — useFormStatus reads
 * the nearest parent form's pending state, not a form it's passed by prop.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
      {...props}
    >
      {pending && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4 animate-spin"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
        </svg>
      )}
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
