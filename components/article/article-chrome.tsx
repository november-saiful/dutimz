"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2 } from "lucide-react";

/**
 * The two round buttons the mockup floats over a story's picture. Back returns
 * the reader to wherever they came from when there is somewhere to go, and to
 * the front page when the link was opened fresh; share uses the phone's own
 * sheet and falls back to the clipboard.
 */
export function ArticleBack({ fallbackHref = "/" }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="post-circle"
      aria-label="ফিরে যান"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft size={19} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

export function ArticleShare({ title, url }: { title: string; url: string }) {
  const [notice, setNotice] = React.useState("");

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* the reader dismissed the sheet — not a failure */
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice("লিংক কপি করা হয়েছে।");
    } catch {
      setNotice("লিংক কপি করা যায়নি।");
    }
  }

  return (
    <button
      type="button"
      className="post-circle"
      aria-label="প্রতিবেদন শেয়ার করুন"
      onClick={() => void share()}
    >
      <Share2 size={18} strokeWidth={2.2} aria-hidden />
      {notice && (
        <span role="status" className="sr-only">
          {notice}
        </span>
      )}
    </button>
  );
}
