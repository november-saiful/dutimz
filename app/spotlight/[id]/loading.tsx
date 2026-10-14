/*
  What the reader sees between tapping a Spotlight post and its render
  landing. Deliberately shell-free (see app/news/[slug]/loading.tsx): a static
  skeleton plus one line naming the wait, no looping shimmer.
*/
export default function SpotlightPostLoading() {
  return (
    <main id="main-content" className="block flex min-w-0 flex-col gap-6">
      <div aria-hidden="true" className="flex min-w-0 flex-col gap-4">
        <div className="h-7 w-2/3 rounded bg-secondary" />
        <div className="h-4 w-1/4 rounded bg-secondary" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-1/2 rounded bg-secondary" />
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        স্পটলাইট পোস্টটি লোড হচ্ছে…
      </p>
    </main>
  );
}
