/*
  What the reader sees between tapping a section and its listing render
  landing. Deliberately shell-free (see app/news/[slug]/loading.tsx): a static
  skeleton plus one line naming the wait, no looping shimmer.
*/
export default function CategoryLoading() {
  return (
    <main id="main-content" className="block flex min-w-0 flex-col gap-6">
      <div aria-hidden="true" className="flex min-w-0 flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <div className="h-20 w-28 shrink-0 rounded bg-secondary" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <div className="h-4 w-11/12 rounded bg-secondary" />
              <div className="h-3 w-1/2 rounded bg-secondary" />
            </div>
          </div>
        ))}
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        বিভাগের খবর লোড হচ্ছে…
      </p>
    </main>
  );
}
