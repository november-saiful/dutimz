import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/*
  The form layout used by every DUTIMZ form: a field is a label, its control and
  an optional hint or error, and fields are grouped into titled sections that lay
  themselves out in one column on phones, two on tablets and three on wide
  screens. Keeping it here means a form only names its fields; it never repeats
  the spacing, the muted hint colour or the error colour, and it never drifts
  from the next form.
*/

function Field({
  label,
  htmlFor,
  hint,
  error,
  wide,
  hideLabel,
  className,
  children,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Span the whole row, for a body field or an uploader. */
  wide?: boolean;
  /** Keep the label for screen readers only (a search bar, a comment box). */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-2",
        wide && "sm:col-span-2 xl:col-span-3",
        className,
      )}
    >
      {label && (
        <Label htmlFor={htmlFor} className={hideLabel ? "sr-only" : undefined}>
          {label}
        </Label>
      )}
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The 1 → 2 → 3 column grid the fields of a section sit in. */
function FieldGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {children}
    </div>
  );
}

/** A titled block of fields; several of these stack inside one form. */
function FieldSection({
  title,
  description,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-4", className)}
      {...props}
    >
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && (
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** A single line of feedback under a whole form rather than under one field. */
function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-sm",
        tone === "error" ? "text-destructive" : "text-green-700",
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export { Field, FieldGrid, FieldSection, FormMessage };
