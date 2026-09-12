/**
 * Phase 5 Poll Section — server component that renders active polls
 * on the homepage. Uses mock data; Supabase-backed in production.
 */
import { PollWidget } from "./PollWidget";
import { getActivePolls } from "@/lib/data/pollMock";

export function PollSection() {
  const polls = getActivePolls();
  if (polls.length === 0) return null;

  return (
    <section className="container mt-12 grid gap-6 md:grid-cols-2">
      {polls.slice(0, 2).map((poll) => (
        <PollWidget key={poll.id} poll={poll} />
      ))}
    </section>
  );
}
