import Link from "next/link";

import { SubscribeForm } from "@/components/dashboard/subscribe-form";
import { SITE_URL } from "@/lib/site";

/**
 * The site footer in the reference design's shape: four link columns and a
 * subscribe column. Every entry is a page that actually exists — the desks
 * come from the database, the rest are the site's own routes — so nothing here
 * is a dead link. The social buttons share the site or write to the desk,
 * because there are no DUTIMZ social accounts to link to yet.
 */
export function SiteFooter({
  sections,
}: {
  sections: { slug: string; label: string }[];
}) {
  const shareUrl = encodeURIComponent(SITE_URL);
  return (
    <footer className="site-footer">
      <div className="f-grid">
        <div className="f-col">
          <h5>খবর</h5>
          {sections
            .filter((section) => section.slug !== "all")
            .map((section) => (
              <Link key={section.slug} href={`/category/${section.slug}/`}>
                {section.label}
              </Link>
            ))}
          <Link href="/search/">সব প্রতিবেদন</Link>
        </div>
        <div className="f-col">
          <h5>বিশেষ</h5>
          <Link href="/flipps/">ফ্লিপস</Link>
          <Link href="/spotlight/">স্পটলাইট</Link>
          <Link href="/statistics/">পরিসংখ্যান</Link>
          <Link href="/corrections/">সংশোধন ও তথ্য যাচাই</Link>
          <Link href="/saved/">সংরক্ষিত প্রতিবেদন</Link>
        </div>
        <div className="f-col">
          <h5>পরিচয় ও নীতি</h5>
          <Link href="/about/">আমাদের পরিচয়</Link>
          <Link href="/guidelines/">সম্পাদকীয় নীতিমালা</Link>
          <Link href="/privacy/">গোপনীয়তা নীতি</Link>
          <a href="mailto:hello@dutimz.com">যোগাযোগ</a>
          <a href="mailto:corrections@dutimz.com">সংশোধন জানান</a>
        </div>
        <div className="f-col">
          <h5>লেখালেখি</h5>
          <Link href="/account/write/">প্রতিবেদন লিখুন</Link>
          <Link href="/account/">আমার অ্যাকাউন্ট</Link>
          <Link href="/account/balance/">আয় ও উত্তোলন</Link>
          <Link href="/spotlight/">সমস্যা জানান</Link>
        </div>
        <div className="f-col f-sub">
          <h5>সাবস্ক্রাইব</h5>
          <SubscribeForm />
          <div className="f-social">
            <a
              href={`https://twitter.com/intent/tweet?url=${shareUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X-এ শেয়ার করুন"
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M22 5.8c-.7.3-1.5.6-2.3.7a4 4 0 0 0 1.7-2.2c-.8.5-1.6.8-2.5 1a4 4 0 0 0-6.9 3.6A11.3 11.3 0 0 1 3.9 4.7a4 4 0 0 0 1.2 5.3c-.6 0-1.3-.2-1.8-.5v.1a4 4 0 0 0 3.2 3.9 4 4 0 0 1-1.8.1 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 18.1a11.3 11.3 0 0 0 6.1 1.8c7.4 0 11.4-6.1 11.4-11.4v-.5c.8-.6 1.5-1.3 2-2.2z" />
              </svg>
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ফেসবুকে শেয়ার করুন"
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M14 9h3l-.4 3H14v9h-3v-9H8V9h3V7.5A3.5 3.5 0 0 1 14.5 4H17v3h-2.5a.5.5 0 0 0-.5.5V9z" />
              </svg>
            </a>
            <a href="mailto:hello@dutimz.com" aria-label="ইমেইল করুন">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M3 5h18v14H3z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </a>
          </div>
        </div>
      </div>
      <div className="f-bottom">
        <Link href="/" className="logo" aria-label="DUTIMZ মূলপাতা">
          {/* The same lockup file the bar uses, so the two never drift apart. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dutimz-text-logo.svg" alt="" width={1278} height={372} />
        </Link>
        <span>© {new Date().getFullYear()} DUTIMZ. সর্বস্বত্ব সংরক্ষিত।</span>
      </div>
    </footer>
  );
}
