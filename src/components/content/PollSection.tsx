/**
 * Phase 5 Poll Section — server component that renders the active polls
 * (Supabase `polls` when configured, mock store otherwise).
 */
import { PollWidget } from "./PollWidget";
import { listActivePolls } from "@/lib/data/publicApi";

export async function PollSection() {
  const polls = await listActivePolls(2);
  if (polls.length === 0) return null;

  return (
    <section className="container mt-12 grid gap-6 md:grid-cols-2">
      {polls.map((poll) => (
        <PollWidget key={poll.id} poll={poll} />
      ))}
    </section>
  );
}
