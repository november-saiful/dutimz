"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
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
 * The top bar's notification bell. Opens an anchored topic picker where the
 * reader ticks the desks they want push for — signed in or not — and plays a
 * local welcome notification on first subscribe so the channel proves
 * itself immediately. Unticking everything unsubscribes the device.
 *
 * The popup is a small anchored panel (not a centred modal): it grows from
 * the bell with one spring on opacity/scale/y only, so it stays on the GPU
 * and respects reduced motion.
 */
export function PushBell() {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  // False until the effect below proves otherwise: the server has no
  // window/Notification, so reading support during render would hydrate
  // a bell the server never sent (React #418 on every page).
  const [supported, setSupported] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [topics, setTopics] = React.useState<PushTopic[]>([]);
  const [saving, setSaving] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Runs after hydration only, so the server and the first client render
  // agree (null bell) and the stored subscription fills in a tick later.
  // The bell reflects the device's stored subscription without asking the
  // server: the token in localStorage is the subscription record.
  React.useEffect(() => {
    if (!isPushSupported()) return;
    setSupported(true);
    if (Notification.permission === "denied") {
      setBlocked(true);
      return;
    }
    const { token, topics: stored } = readStored();
    if (token) {
      setSubscribed(true);
      setTopics(stored);
    }
  }, []);

  // Close on outside click and on Escape: a popup anchored to the bar has
  // no modal scrim to do that work.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

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
        // popup stays open so the reader can retry or pick nothing.
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

  const panelMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: -6 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: -4 },
      };

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        type="button"
        className="bell-toggle"
        aria-label={
          subscribed ? "বিজ্ঞপ্তির বিষয় বদলান" : "বিজ্ঞপ্তি চালু করুন"
        }
        title={
          subscribed ? "বিজ্ঞপ্তির বিষয় বদলান" : "বিজ্ঞপ্তি চালু করুন"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      >
        {subscribed ? (
          <BellRing aria-hidden />
        ) : (
          <Bell aria-hidden />
        )}
        {subscribed && <span className="bell-dot" aria-hidden />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="push-popup"
            role="dialog"
            aria-label="কোন খবরের বিজ্ঞপ্তি পাবেন?"
            className="absolute right-0 top-[calc(100%+10px)] z-[70] max-h-[calc(100dvh-var(--topbar)-20px)] w-[min(340px,calc(100vw-32px))] origin-top-right overflow-y-auto rounded-2xl border bg-white p-5 shadow-[0_24px_60px_-20px_rgba(26,18,32,0.35),0_8px_20px_-10px_rgba(26,18,32,0.18)] max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-[calc(var(--topbar)+8px)] max-sm:w-auto max-sm:origin-top-center"
            style={{ willChange: "transform, opacity" }}
            initial={panelMotion.initial}
            animate={panelMotion.animate}
            exit={panelMotion.exit}
            transition={
              shouldReduceMotion
                ? { duration: 0.12 }
                : { type: "spring", stiffness: 400, damping: 30 }
            }
          >
            <div className="pr-2">
              <p className="text-[15px] font-bold leading-snug tracking-tight">
                কোন খবরের বিজ্ঞপ্তি পাবেন?
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                বিষয় বেছে টিক দিন — নতুন খবর প্রকাশ হলেই ব্রাউজারে জানতে
                পারবেন। অ্যাকাউন্ট ছাড়াই চলবে।
              </p>
            </div>
            {blocked ? (
              <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                ব্রাউজারে বিজ্ঞপ্তি বন্ধ (blocked) আছে। ঠিকানার পাশের
                তালা/সেটিং আইকন থেকে অনুমতি দিলে আবার চেষ্টা করুন।
              </p>
            ) : (
              <div
                className="mt-4 grid gap-2"
                role="group"
                aria-label="বিজ্ঞপ্তির বিষয়"
              >
                {PUSH_TOPICS.map((topic, index) => {
                  const checked = topics.includes(topic);
                  return (
                    <motion.label
                      key={topic}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-white ${
                        checked
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted/60"
                      }`}
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: shouldReduceMotion ? 0 : 0.04 + index * 0.04,
                        duration: 0.18,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(topic)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      {PUSH_TOPIC_LABELS[topic]}
                    </motion.label>
                  );
                })}
              </div>
            )}
            {!blocked && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                সব টিক তুলে সংরক্ষণ করলে এই ডিভাইসের বিজ্ঞপ্তি বন্ধ হয়ে যাবে।
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={save}
                disabled={saving || blocked}
                className="w-full sm:w-auto"
              >
                {saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
