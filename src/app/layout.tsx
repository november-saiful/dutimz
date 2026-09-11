import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { GlassNavigation } from "@/components/navigation/GlassNavigation";
import { Footer } from "@/components/navigation/Footer";
import { MobileBottomDock } from "@/components/navigation/MobileBottomDock";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { getActiveCategories } from "@/lib/data/queries";
import { getAuthContext } from "@/lib/auth/server";
import { SITE, DEFAULT_LOCALE } from "@/lib/constants/app";
import { SITE_NAME_BN } from "@/lib/constants/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE_NAME_BN} | ${SITE.name}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE_NAME_BN} | ${SITE.name}`,
    description: SITE.description,
    locale: "bn_BD",
    alternateLocale: "en_US",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef3fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1218" },
  ],
};

// Runs before paint to apply the persisted theme and avoid FOUC.
const themeInitScript = `
(function() {
  try {
    var mode = JSON.parse(localStorage.getItem('dutimz-theme') || '{}').state?.mode || 'system';
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, auth] = await Promise.all([
    getActiveCategories(),
    getAuthContext(),
  ]);
  const lang = DEFAULT_LOCALE;

  const sessionUser = auth.profile
    ? {
        displayName: auth.profile.display_name,
        email: auth.profile.email,
        avatarUrl: auth.profile.avatar_url,
        role: auth.profile.role,
      }
    : null;

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <AntdRegistry>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
          >
            মূল কন্টেন্টে যান / Skip to content
          </a>
          <GlassNavigation categories={categories} user={sessionUser} />
          <main id="main-content" className="pb-24 tablet:pb-0">{children}</main>
          <Footer categories={categories} />
          <MobileBottomDock role={sessionUser?.role ?? null} />
          </AntdRegistry>
        </Providers>
      </body>
    </html>
  );
}
