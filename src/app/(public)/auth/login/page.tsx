"use client";
export const runtime = "edge";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AUTH } from "@/lib/auth/config";
import type { Locale } from "@/lib/constants/app";

const COPY = {
  bn: {
    title: "লগইন",
    subtitle: "শুধুমাত্র Google অ্যাকাউন্ট দিয়ে লগইন করুন।",
    button: "Google দিয়ে লগইন করুন",
    redirecting: "Google-এ পাঠানো হচ্ছে…",
    error: "লগইন শুরু করা যায়নি। আবার চেষ্টা করুন।",
    legal: "লগইন করলে আপনি আমাদের শর্তাবলী ও গোপনীয়তা নীতিতে সম্মত হচ্ছেন।",
  },
  en: {
    title: "Log in",
    subtitle: "Sign in with your Google account only.",
    button: "Sign in with Google",
    redirecting: "Redirecting to Google…",
    error: "Could not start sign-in. Please try again.",
    legal: "By continuing you agree to our Terms and Privacy Policy.",
  },
} as const;

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>("bn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read locale from the cookie on mount to avoid hydration mismatch.
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)dutimz-locale=(bn|en)/);
    if (match?.[1]) setLocale(match[1] as Locale);
  }, []);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const next = searchParams.get("next") ?? AUTH.profilePath;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${AUTH.callbackPath}?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(COPY[locale].error);
        setLoading(false);
      }
      // On success the browser is redirected to Google; nothing else to do.
    } catch {
      setError(COPY[locale].error);
      setLoading(false);
    }
  }

  const c = COPY[locale];

  return (
    <div className="container mt-16 max-w-md">
      <div className="glass-card p-8 text-center">
        <h1 className="text-2xl font-bold">{c.title}</h1>
        <p className="mt-3 text-sm opacity-70">{c.subtitle}</p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-neutral-200 bg-white/70 px-6 py-3 text-sm font-bold transition hover:bg-white disabled:opacity-60 dark:border-neutral-700 dark:bg-white/10 dark:hover:bg-white/20"
        >
          <GoogleIcon />
          {loading ? c.redirecting : c.button}
        </button>

        {error && (
          <p role="alert" className="mt-4 text-sm" style={{ color: "var(--color-error, #ea4335)" }}>
            {error}
          </p>
        )}

        <p className="mt-6 text-xs opacity-50">{c.legal}</p>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary for static prerender.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container mt-16 max-w-md" />}> 
      <LoginPageInner />
    </Suspense>
  );
}
