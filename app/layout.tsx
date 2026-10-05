import type { Metadata } from "next";
import { Noto_Serif_Bengali } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { SITE_URL } from "@/lib/site";

/**
 * The Bengali face is self-hosted by `next/font` rather than fetched from a `<link>` in the head.
 * The external stylesheet was render-blocking and needed two extra origins warmed up before any
 * text could paint; now the font files ship from our own origin with the rest of the CSS.
 */
const bengali = Noto_Serif_Bengali({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-bengali",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "DUTIMZ — ঢাকা বিশ্ববিদ্যালয়ের সংবাদমাধ্যম",
    template: "%s | DUTIMZ",
  },
  description:
    "ঢাকা বিশ্ববিদ্যালয় ক্যাম্পাসের সংবাদ, মতামত, সংস্কৃতি ও শিক্ষার্থীদের গল্প।",
  openGraph: {
    siteName: "DUTIMZ",
    locale: "bn_BD",
    type: "website",
    images: [{ url: "/og-banner.png", width: 1200, height: 630, alt: "DUTIMZ" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-banner.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" className={bengali.variable}>
      <head>
        <meta name="theme-color" content="#5f2367" />
        <meta name="color-scheme" content="light" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/brand-icon.svg" />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          মূল লেখায় যান
        </a>
        <ToastProvider>
          <div id="main-content">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
