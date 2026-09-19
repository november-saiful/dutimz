/**
 * Phase 5 Text-to-Speech — reads article content aloud using the browser's
 * Web Speech API. Supports Bangla (bn) and English (en) voices, playback
 * controls (play/pause/stop), speed adjustment, and a progress bar.
 * Spec: Appendix C — Web Speech API for TTS.
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";


const COPY = {
  listen: "শুনুন",
  pause: "থামুন",
  stop: "বন্ধ করুন",
  speed: "গতি",
  loading: "লোড হচ্ছে…",
  notSupported: "আপনার ব্রাউজার TTS সমর্থন করে না।",
} as const;

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

/** Strip HTML tags from body content for plain-text TTS. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function TextToSpeech({
  bodyHtml,
  title,
  language = "bn",
}: {
  bodyHtml: string;
  title: string;
  language?: "bn" | "en";
}) {
  const t = COPY;
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalDurationRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) {
      setSupported(false);
      return;
    }
    synthRef.current = synth;
    return () => {
      synth.cancel();
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const findVoice = useCallback(
    (lang: string): SpeechSynthesisVoice | null => {
      const synth = synthRef.current;
      if (!synth) return null;
      const voices = synth.getVoices();
      const prefix = lang === "bn" ? "bn" : "en";
      return (
        voices.find((v) => v.lang.startsWith(prefix) && v.localService) ??
        voices.find((v) => v.lang.startsWith(prefix)) ??
        null
      );
    },
    [],
  );

  const startSpeaking = useCallback(() => {
    const synth = synthRef.current;
    if (!synth) return;

    synth.cancel();
    const text = stripHtml(`${title}. ${bodyHtml}`);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.pitch = 1;

    const voice = findVoice(language);
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
      setProgress(100);
      if (progressTimer.current) clearInterval(progressTimer.current);
    };

    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
      if (progressTimer.current) clearInterval(progressTimer.current);
    };

    // Estimate duration for progress bar (rough: ~150 words/min at 1x)
    const wordCount = text.split(/\s+/).length;
    totalDurationRef.current = (wordCount / 150) * 60 * (1 / speed);

    utteranceRef.current = utterance;
    synth.speak(utterance);
    setSpeaking(true);
    setPaused(false);
    setProgress(0);

    // Progress timer
    if (progressTimer.current) clearInterval(progressTimer.current);
    const startTime = Date.now();
    progressTimer.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = Math.min(100, (elapsed / totalDurationRef.current) * 100);
      setProgress(pct);
    }, 200);
  }, [bodyHtml, title, language, speed, findVoice]);

  const handlePause = useCallback(() => {
    const synth = synthRef.current;
    if (!synth) return;
    if (paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  }, [paused]);

  const handleStop = useCallback(() => {
    const synth = synthRef.current;
    synth?.cancel();
    setSpeaking(false);
    setPaused(false);
    setProgress(0);
    if (progressTimer.current) clearInterval(progressTimer.current);
  }, []);

  if (!supported) {
    return (
      <p className="text-xs opacity-40 italic">{t.notSupported}</p>
    );
  }

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          {speaking && !paused ? (
            <>
              <line x1="15" y1="9" x2="15" y2="15" />
              <line x1="19" y1="7" x2="19" y2="17" />
            </>
          ) : (
            <>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          )}
        </svg>
        {t.listen}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {/* Progress bar */}
          {speaking && (
            <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--md-sys-color-surface-variant)" }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${progress}%`, background: "var(--md-sys-color-primary)" }}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            {!speaking ? (
              <button
                type="button"
                onClick={startSpeaking}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white"
                style={{ background: "var(--md-sys-color-primary)" }}
              >
                ▶ {t.listen}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{ background: "var(--md-sys-color-primary-container)" }}
                >
                  {paused ? "▶" : "⏸"} {paused ? t.listen : t.pause}
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium opacity-70 hover:opacity-100"
                >
                  ⏹ {t.stop}
                </button>
              </>
            )}

            {/* Speed selector */}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] opacity-40">{t.speed}:</span>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSpeed(s);
                    if (speaking) {
                      // Restart with new speed
                      handleStop();
                      setTimeout(() => startSpeaking(), 100);
                    }
                  }}
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                    speed === s
                      ? "text-white"
                      : "opacity-40 hover:opacity-70"
                  }`}
                  style={speed === s ? { background: "var(--md-sys-color-primary)" } : {}}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
