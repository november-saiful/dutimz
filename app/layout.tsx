import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

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
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn">
      <head>
        <meta name="theme-color" content="#5f2367" />
        <meta name="color-scheme" content="light" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/brand-icon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          মূল লেখায় যান
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
