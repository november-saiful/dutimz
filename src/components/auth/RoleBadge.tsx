"use client";

const ROLE_STYLES: Record<string, { bg: string; fg: string }> = {
  visitor: {
    bg: "var(--md-sys-color-surface-variant)",
    fg: "var(--md-sys-color-on-surface)",
  },
  reporter: {
    bg: "var(--md-sys-color-secondary)",
    fg: "var(--md-sys-color-on-secondary)",
  },
  moderator: {
    bg: "var(--md-sys-color-tertiary)",
    fg: "var(--md-sys-color-on-tertiary)",
  },
  admin: {
    bg: "var(--md-sys-color-primary)",
    fg: "var(--md-sys-color-on-primary)",
  },
};

export function RoleBadge({
  role,
  labelBn,
  labelEn,
  locale = "bn",
}: {
  role: string;
  labelBn?: string;
  labelEn?: string;
  locale?: "bn" | "en";
}) {
  const style =
    ROLE_STYLES[role] ??
    ({ bg: "var(--md-sys-color-surface-variant)", fg: "var(--md-sys-color-on-surface)" } as const);
  const label = locale === "bn" ? (labelBn ?? role) : (labelEn ?? role);

  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold capitalize"
      style={{ background: style.bg, color: style.fg }}
      data-role={role}
    >
      {label}
    </span>
  );
}
