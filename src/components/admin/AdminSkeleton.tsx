"use client";

/**
 * Reusable skeleton shapes for admin panels.
 * Matches the glass-card styling pattern used across the dashboard.
 */

const panelStyle = {
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border)",
};

/** Full-page loading skeleton for a table-based panel (Users, Categories, Tags, Ads, Newsletter). */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl p-6 space-y-4" style={panelStyle}>
      {/* Title */}
      <div className="skeleton h-5 w-40" />
      {/* Search bar */}
      <div className="flex gap-3">
        <div className="skeleton h-9 w-64 rounded-xl" />
        <div className="skeleton h-9 w-24 rounded-full" />
      </div>
      {/* Table rows */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
            <div className="skeleton h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-3/4" />
              <div className="skeleton h-2.5 w-1/3" />
            </div>
            <div className="skeleton h-5 w-16 rounded-full shrink-0" />
            <div className="skeleton h-6 w-12 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Loading skeleton for the Site Settings panel. */
export function SettingsSkeleton() {
  return (
    <div className="rounded-xl p-6 space-y-8" style={panelStyle}>
      {/* Section 1: Basic info */}
      <section className="space-y-4">
        <div className="skeleton h-4 w-24" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-10 w-full rounded-xl" />
          </div>
        </div>
      </section>
      {/* Section 2: Colors */}
      <section className="space-y-4">
        <div className="skeleton h-4 w-32" />
        <div className="grid gap-4 grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-20" />
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
                <div className="skeleton h-10 flex-1 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </section>
      {/* Section 3: Social links */}
      <section className="space-y-4">
        <div className="skeleton h-4 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-9 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </section>
      {/* Section 4: SEO */}
      <section className="space-y-3">
        <div className="skeleton h-4 w-20" />
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-10 w-full rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-14 w-full rounded-xl" />
        </div>
      </section>
      {/* Section 5: Maintenance toggle */}
      <section className="flex items-center gap-4">
        <div className="skeleton h-7 w-12 rounded-full" />
        <div className="space-y-1">
          <div className="skeleton h-3.5 w-28" />
          <div className="skeleton h-2.5 w-48" />
        </div>
      </section>
      {/* Save button */}
      <div className="skeleton h-10 w-32 rounded-full" />
    </div>
  );
}

/** Loading skeleton for the Polls panel. */
export function PollsSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="rounded-xl p-6 space-y-4" style={panelStyle}>
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-9 w-28 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="rounded-lg p-4 space-y-3" style={{ border: "1px solid var(--glass-border)" }}>
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-2.5 w-1/3" />
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-5 w-14 rounded-full" />
                <div className="skeleton h-5 w-8" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Inline loading spinner for API calls within a panel. */
export function InlineSpinner() {
  return (
    <span className="inline-flex items-center gap-2 text-xs opacity-60">
      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading…
    </span>
  );
}
