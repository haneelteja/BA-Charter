"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { PASSWORD_RULES } from "@/lib/validation";
import { PasswordInput } from "./PasswordInput";

export function PasswordStrengthField({
  id,
  name,
  label = "Password",
  placeholder = "Password",
  required = true,
}: {
  id: string;
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <PasswordInput
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <ul className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(value);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5",
                passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted"
              )}
            >
              <span aria-hidden="true">{passed ? "✓" : "○"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
