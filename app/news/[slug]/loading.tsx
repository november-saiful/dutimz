/*
  What the reader sees between tapping a story and the article render landing.
  Deliberately shell-free: the shell awaits the section list from the database,
  which is the very round-trip this screen covers for, so waiting on it would
  defeat the purpose. A static skeleton — no looping shimmer — plus one line
  that says what is loading.
*/
export default function ArticleLoading() {
  return (
    <main id="main-content" className="block flex min-w-0 flex-col gap-6">
      <div aria-hidden="true" className="flex min-w-0 flex-col gap-4">
        <div className="h-8 w-3/4 rounded bg-secondary" />
        <div className="h-4 w-1/3 rounded bg-secondary" />
        <div className="aspect-[16/9] w-full rounded bg-secondary" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-full rounded bg-secondary" />
          <div className="h-4 w-2/3 rounded bg-secondary" />
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        প্রতিবেদনটি লোড হচ্ছে…
      </p>
    </main>
  );
}
