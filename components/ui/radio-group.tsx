"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type RadioOption = {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
};

/*
  A group of radio cards.

  Real radios in real labels: the submitted value still arrives through FormData
  under `name`, and a keyboard user can arrow through the group. The visual part
  is only the card around each one.
*/
function RadioGroup({
  name,
  value,
  onValueChange,
  options,
  className,
}: {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn("grid gap-2 sm:grid-cols-2", className)}
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const active = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 text-sm transition-colors",
              active ? "border-primary bg-accent" : "hover:bg-accent/50",
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onValueChange(option.value)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium">{option.label}</span>
              {option.description && (
                <span className="block text-xs text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export { RadioGroup };
