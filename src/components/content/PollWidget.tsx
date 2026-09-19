/**
 * Phase 5 Poll Widget — displays an interactive poll with voting, animated
 * results bars, and a "total votes" counter. Bilingual, glass-themed.
 * Mock data seeded for demo; Supabase-backed polls in production.
 */
"use client";

import { useState, useCallback, useEffect } from "react";


export interface PollOption {
  id: string;
  label_bn: string;
  label_en: string;
  votes: number;
}

export interface Poll {
  id: string;
  question_bn: string;
  question_en: string;
  options: PollOption[];
  totalVotes: number;
  endsAt?: string; // ISO date
}

const COPY = {
  vote: "ভোট দিন",
  voted: "ভোট দেওয়া হয়েছে",
  totalVotes: "মোট ভোট",
  closed: "পোল বন্ধ",
  thanks: "ভোটের জন্য ধন্যবাদ!",
  loginRequired: "ভোট দিতে লগইন করুন।",
  alreadyVoted: "আপনি ইতিমধ্যে ভোট দিয়েছেন।",
  voteFailed: "ভোট দেওয়া যায়নি — আবার চেষ্টা করুন।",
} as const;

export function PollWidget({ poll: initialPoll }: { poll: Poll }) {
  const t = COPY;
  const [poll, setPoll] = useState(initialPoll);
  const [selected, setSelected] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed = poll.endsAt ? new Date(poll.endsAt) < new Date() : false;

  const handleVote = useCallback(async () => {
    if (!selected || voted || submitting || isClosed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: poll.id, optionId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.poll) {
        setPoll(data.poll);
        setVoted(true);
        return;
      }
      // Voting is one-per-account, so a signed-out or repeat voter needs a hint.
      if (res.status === 401) setError(t.loginRequired);
      else if (res.status === 409) {
        setError(String(data.error ?? "").includes("already") ? t.alreadyVoted : t.closed);
      } else setError(t.voteFailed);
    } catch {
      setError(t.voteFailed);
    } finally {
      setSubmitting(false);
    }
  }, [selected, voted, submitting, isClosed, poll.id, t]);

  const showResults = voted || isClosed;

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
      <h3 className="mb-4 text-sm font-bold leading-snug">
        📊 {poll.question_bn}
      </h3>

      <div className="space-y-3">
        {poll.options.map((opt) => {
          const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
          const isSelected = selected === opt.id;

          return (
            <div key={opt.id}>
              {!showResults ? (
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                  }`}
                >
                  <input
                    type="radio"
                    name={`poll-${poll.id}`}
                    value={opt.id}
                    checked={isSelected}
                    onChange={() => setSelected(opt.id)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected ? "border-primary" : "border-gray-400"
                    }`}
                  >
                    {isSelected && <span className="h-2 w-2 rounded-full" style={{ background: "var(--md-sys-color-primary)" }} />}
                  </span>
                  <span className="text-sm">
                    {opt.label_bn}
                  </span>
                </label>
              ) : (
                <div className="relative overflow-hidden rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
                  {/* Background bar */}
                  <div
                    className="absolute inset-0 rounded-lg transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: isSelected || isClosed
                        ? "var(--md-sys-color-primary-container)"
                        : "var(--md-sys-color-surface-variant)",
                      opacity: 0.6,
                    }}
                  />
                  <div className="relative flex items-center justify-between">
                    <span className="text-sm">
                      {opt.label_bn}
                    </span>
                    <span className="text-xs font-bold opacity-80">
                      {pct}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Vote button */}
      {!showResults && (
        <button
          type="button"
          onClick={handleVote}
          disabled={!selected || submitting}
          className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          {submitting ? "…" : t.vote}
        </button>
      )}

      {voted && (
        <p className="mt-3 text-center text-xs font-medium" style={{ color: "var(--md-sys-color-primary)" }}>
          ✓ {t.thanks}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-xs" style={{ color: "var(--color-error, #ea4335)" }}>
          {error}
        </p>
      )}

      <p className="mt-3 text-center text-[10px] opacity-40">
        {poll.totalVotes.toLocaleString()} {t.totalVotes}
        {isClosed && ` · ${t.closed}`}
      </p>
    </div>
  );
}
