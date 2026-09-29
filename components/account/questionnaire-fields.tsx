"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type QuestionnaireField = {
  id: string;
  label: string;
  type: "single" | "multi" | "text" | "textarea" | "number" | "people";
  required?: boolean;
  options?: string[];
  conditions?: { fieldId: string; values: string[] }[];
  conditionMode?: "any" | "all";
  countLabel?: string;
  personFields?: { id: string; label: string; type: string; options?: string[] }[];
};

export type QuestionnaireVersion = {
  id: string;
  version: number;
  schema: QuestionnaireField[];
};

function isVisible(
  field: QuestionnaireField,
  answers: Record<string, unknown>,
  visibleIds: Set<string>,
): boolean {
  const conditions = field.conditions ?? [];
  if (!conditions.length) return true;
  const mode = field.conditionMode ?? "any";
  const matches = conditions.map((condition) => {
    if (!visibleIds.has(condition.fieldId)) return false;
    const answer = answers[condition.fieldId];
    return condition.values.some(
      (value) =>
        answer === value ||
        (Array.isArray(answer) && answer.includes(value)),
    );
  });
  return mode === "all" ? matches.every(Boolean) : matches.some(Boolean);
}

export function visibleFields(
  schema: QuestionnaireField[],
  answers: Record<string, unknown>,
): QuestionnaireField[] {
  const visible: QuestionnaireField[] = [];
  const visibleIds = new Set<string>();
  for (const field of schema) {
    if (isVisible(field, answers, visibleIds)) {
      visible.push(field);
      visibleIds.add(field.id);
    }
  }
  return visible;
}

export function QuestionnaireFields({
  questionnaire,
  answers,
  onChange,
}: {
  questionnaire: QuestionnaireVersion;
  answers: Record<string, unknown>;
  onChange: (answers: Record<string, unknown>) => void;
}) {
  const fields = visibleFields(questionnaire.schema, answers);
  const set = (id: string, value: unknown) => {
    const next = { ...answers };
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete next[id];
    } else {
      next[id] = value;
    }
    // Drop answers that are no longer visible so the server validator
    // ("প্রযোজ্য নয় এমন প্রশ্নের উত্তর") never rejects the submission.
    const stillVisible = new Set(
      visibleFields(questionnaire.schema, next).map((f) => f.id),
    );
    for (const key of Object.keys(next)) {
      if (!stillVisible.has(key)) delete next[key];
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <div key={field.id} className="grid gap-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          <FieldInput
            field={field}
            value={answers[field.id]}
            onChange={(value) => set(field.id, value)}
          />
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: QuestionnaireField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "single") {
    return (
      <div className="flex flex-col gap-1">
        {(field.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={field.id}
              checked={value === option}
              onChange={() => onChange(option)}
              required={field.required && value === undefined}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "multi") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-col gap-1">
        {(field.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() =>
                onChange(
                  selected.includes(option)
                    ? selected.filter((v) => v !== option)
                    : [...selected, option],
                )
              }
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        min={0}
        value={typeof value === "number" ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    );
  }
  if (field.type === "people") {
    const count = typeof value === "object" && value !== null
      ? Number((value as { count?: unknown }).count ?? 0)
      : 0;
    const people = (typeof value === "object" && value !== null
      ? ((value as { people?: unknown[] }).people ?? [])
      : []) as Record<string, string>[];
    const setCount = (next: number) => {
      const list = [...people];
      while (list.length < next) list.push({});
      onChange({ count: next, people: list.slice(0, Math.max(next, 0)) });
    };
    const setPerson = (index: number, key: string, personValue: string) => {
      const list = people.map((p, i) =>
        i === index ? { ...p, [key]: personValue } : p,
      );
      onChange({ count, people: list });
    };
    return (
      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="grid gap-2">
          <Label>
            {field.countLabel ?? "সংখ্যা"}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={count}
            onChange={(e) =>
              setCount(Math.max(0, Number(e.target.value || 0)))
            }
          />
        </div>
        {Array.from({ length: Math.min(count, 100) }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-md bg-muted p-3"
          >
            <p className="text-xs font-medium text-muted-foreground">
              ব্যক্তি {new Intl.NumberFormat("bn-BD").format(index + 1)}
            </p>
            {(field.personFields ?? []).map((personField) => (
              <div key={personField.id} className="grid gap-1">
                <Label className="text-xs">{personField.label}</Label>
                {personField.type === "single" ? (
                  <select
                    value={people[index]?.[personField.id] ?? ""}
                    onChange={(e) =>
                      setPerson(index, personField.id, e.target.value)
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">বেছে নিন</option>
                    {(personField.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={people[index]?.[personField.id] ?? ""}
                    onChange={(e) =>
                      setPerson(index, personField.id, e.target.value)
                    }
                    maxLength={200}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      maxLength={500}
    />
  );
}
