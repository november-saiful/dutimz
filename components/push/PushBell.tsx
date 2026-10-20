"use client";

import * as React from "react";
import { Bell, BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  PUSH_TOPICS,
  PUSH_TOPIC_LABELS,
  disablePush,
  enablePush,
  isPushSupported,
  showWelcomeNotification,
  type PushTopic,
} from "@/lib/push/firebase-client";
import { removePushToken, savePushToken, saveTopicPrefs } from "@/lib/push/supabase-store";

const TOKEN_KEY = "dutimz-push-token";
const TOPICS_KEY = "dutimz-push-topics";

function readStored(): { token: string | null; topics: PushTopic[] } {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(TOPICS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const topics = Array.isArray(parsed)
      ? parsed.filter(
          (t): t is PushTopic =>
            typeof t === "string" && (PUSH_TOPICS as readonly string[]).includes(t)
        )
      : [];
    return { token, topics };
  } catch {
    return { token: null, topics: [] };
  }
}

/**
 * The top bar's notification bell. Opens a topic picker where the reader
 * ticks the desks they want push for — signed in or not — and plays a
 * local welcome notification on first subscribe so the channel proves
 * itself immediately. Unticking everything unsubscribes the device.
 */
export function PushBell() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [supported] = React.useState(() => isPushSupported());
  const [blocked, setBlocked] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [topics, setTopics] = React.useState<PushTopic[]>([]);
  const [saving, setSaving] = React.useState(false);

  // The bell reflects the device's stored subscription without asking the
  // server: the token in localStorage is the subscription record.
  React.useEffect(() => {
    if (!supported) return;
    if (Notification.permission === "denied") {
      setBlocked(true);
      return;
    }
    const { token, topics: stored } = readStored();
    if (token) {
      setSubscribed(true);
      setTopics(stored);
    }
  }, [supported]);

  function toggle(topic: PushTopic) {
    setTopics((current) =>
      current.includes(topic)
        ? current.filter((t) => t !== topic)
        : [...current, topic]
    );
  }

  async function save() {
    if (!supported) return;
    setSaving(true);
    try {
      const previous = readStored();

      // No topics ticked: this is the unsubscribe path.
      if (topics.length === 0) {
        if (previous.token) {
          await removePushToken(previous.token).catch(() => undefined);
          await saveTopicPrefs(previous.token, []).catch(() => undefined);
        }
        await disablePush();
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOPICS_KEY);
        setSubscribed(false);
        toast({
          title: "বিজ্ঞপ্তি বন্ধ করা হয়েছে",
          description: "এই ডিভাইসে আর পুশ বিজ্ঞপ্তি আসবে না।",
          tone: "info",
        });
        setOpen(false);
        return;
      }

      const token = await enablePush();
      if (!token) {
        // enablePush returns null for unsupported/denied/dismissed: the
        // dialog stays open so the reader can retry or pick nothing.
        if (Notification.permission === "denied") setBlocked(true);
        else
          toast({
            title: "অনুমতি পাওয়া যায়নি",
            description: "ব্রাউজারে বিজ্ঞপ্তির অনুমতি দিলে আবার চেষ্টা করুন।",
            tone: "error",
          });
        return;
      }

      await savePushToken(token);
      await saveTopicPrefs(token, topics);
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOPICS_KEY, JSON.stringify(topics));
      setSubscribed(true);

      // First subscribe on this device: the sample notification that
      // introduces the channel. Returning readers just get a toast.
      if (!previous.token) {
        const shown = await showWelcomeNotification();
        toast({
          title: "বিজ্ঞপ্তি চালু হয়েছে",
          description: shown
            ? "নমুনা বিজ্ঞপ্তিটি দেখুন — এভাবেই খবর আসবে।"
            : "বাছাই করা বিষয়ে নতুন খবর এলেই জানতে পারবেন।",
          tone: "success",
        });
      } else {
        toast({
          title: "পছন্দ সংরক্ষিত হয়েছে",
          description: "বাছাই করা বিষয়ের খবরই শুধু আসবে।",
          tone: "success",
        });
      }
      setOpen(false);
    } catch {
      toast({
        title: "সংরক্ষণ করা যায়নি",
        description: "আবার চেষ্টা করুন।",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!supported) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="bell-toggle"
          aria-label={
            subscribed ? "বিজ্ঞপ্তির বিষয় বদলান" : "বিজ্ঞপ্তি চালু করুন"
          }
          title={
            subscribed ? "বিজ্ঞপ্তির বিষয় বদলান" : "বিজ্ঞপ্তি চালু করুন"
          }
        >
          {subscribed ? (
            <BellRing aria-hidden />
          ) : (
            <Bell aria-hidden />
          )}
          {subscribed && <span className="bell-dot" aria-hidden />}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>কোন খবরের বিজ্ঞপ্তি পাবেন?</DialogTitle>
          <DialogDescription>
            বিষয় বেছে টিক দিন — নতুন খবর প্রকাশ হলেই ব্রাউজারে জানতে
            পারবেন। অ্যাকাউন্ট ছাড়াই চলবে।
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            ব্রাউজারে বিজ্ঞপ্তি বন্ধ (blocked) আছে। ঠিকানার পাশের তালা/সেটিং
            আইকন থেকে অনুমতি দিলে আবার চেষ্টা করুন।
          </p>
        ) : (
          <div className="grid gap-2" role="group" aria-label="বিজ্ঞপ্তির বিষয়">
            {PUSH_TOPICS.map((topic) => {
              const checked = topics.includes(topic);
              return (
                <label
                  key={topic}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors ${
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-muted/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(topic)}
                    className="size-4 shrink-0 accent-[#1a73e8]"
                  />
                  {PUSH_TOPIC_LABELS[topic]}
                </label>
              );
            })}
          </div>
        )}
        {!blocked && (
          <p className="text-xs text-muted-foreground">
            সব টিক তুলে সংরক্ষণ করলে এই ডিভাইসের বিজ্ঞপ্তি বন্ধ হয়ে যাবে।
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            onClick={save}
            disabled={saving || blocked}
            className="w-full sm:w-auto"
          >
            {saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
