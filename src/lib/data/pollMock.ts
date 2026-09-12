/**
 * Phase 5 Poll mock data — globalThis-persisted for dev server.
 */
import type { Poll } from "@/components/content/PollWidget";

const g = globalThis as Record<string, unknown>;
if (!g.__dutimz_polls_store) {
  g.__dutimz_polls_store = [
    {
      id: "poll-1",
      question_bn: "ঢাকা মেট্রোরেলের নতুন সময়সূচি সম্পর্কে আপনার মতামত কী?",
      question_en: "What do you think about the new Metro Rail timetable?",
      options: [
        { id: "opt-1a", label_bn: "খুব ভালো", label_en: "Very good", votes: 142 },
        { id: "opt-1b", label_bn: "ভালো", label_en: "Good", votes: 89 },
        { id: "opt-1c", label_bn: "গড়", label_en: "Average", votes: 34 },
        { id: "opt-1d", label_bn: "খারাপ", label_en: "Poor", votes: 12 },
      ],
      totalVotes: 277,
    },
    {
      id: "poll-2",
      question_bn: "বাংলা নিউজরুমে AI ব্যবহার করা উচিত কি?",
      question_en: "Should AI be used in Bangla newsrooms?",
      options: [
        { id: "opt-2a", label_bn: "হ্যাঁ, সম্পূর্ণ", label_en: "Yes, fully", votes: 56 },
        { id: "opt-2b", label_bn: "আংশিকভাবে", label_en: "Partially", votes: 98 },
        { id: "opt-2c", label_bn: "না, কখনোই না", label_en: "No, never", votes: 23 },
      ],
      totalVotes: 177,
    },
  ] as Poll[];
}
const store = g.__dutimz_polls_store as Poll[];

export function getActivePolls(): Poll[] {
  return store;
}

export function getPollById(id: string): Poll | undefined {
  return store.find((p) => p.id === id);
}

export function votePoll(pollId: string, optionId: string): Poll | null {
  const poll = store.find((p) => p.id === pollId);
  if (!poll) return null;
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) return null;
  option.votes += 1;
  poll.totalVotes += 1;
  return poll;
}
