export default function Loading() {
  return (
    <div className="container flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        {/* Spinning ring with plum accent */}
        <div className="relative size-8">
          <div className="absolute inset-0 rounded-full border-2 border-neutral-200 dark:border-neutral-800" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--md-sys-color-primary)]" />
        </div>
        <p className="text-xs font-medium text-neutral-400">লোড হচ্ছে…</p>
      </div>
    </div>
  );
}
