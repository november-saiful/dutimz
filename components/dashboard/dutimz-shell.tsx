import * as React from "react";

import { DashboardHeader, type Crumb } from "@/components/dashboard/dashboard-header";
import { MobileDock } from "@/components/dashboard/mobile-dock";
import { SiteFooter } from "@/components/dashboard/site-footer";
import { getNavCategories } from "@/lib/stories";

/**
 * The site shell in the reference design's shape: the sticky top bar, the
 * page's own content, the footer with the real desks and pages, and the phone
 * dock over all of it. `bare` hands the whole viewport to the page (the front
 * page and the article view draw their own containers and sticky bars); every
 * other page gets one framed column with a breadcrumb head.
 */
export async function DutimzShell({
  title,
  crumbs,
  bare = false,
  mobileDeck = false,
  children,
}: {
  title?: string;
  crumbs?: Crumb[];
  /** The page draws its own containers: no frame, no breadcrumb head. */
  bare?: boolean;
  /**
   * A `bare` deck page (the flipps feeds) that goes immersive on phones: below
   * the dock breakpoint the footer drops out and the page's own content fills
   * the space between the top bar and the dock. Wide screens keep `bare` as-is.
   */
  mobileDeck?: boolean;
  children: React.ReactNode;
}) {
  // One read serves the top bar and the footer, so the desks can never drift
  // between them. Demo mode and a failed query fall back to the static list.
  const sections = await getNavCategories();

  return (
    <>
      <DashboardHeader sections={sections} />
      {bare ? (
        <main id="main-content">{children}</main>
      ) : (
        <main id="main-content" className="block flex min-w-0 flex-col gap-6">
          {(title || crumbs?.length) && (
            <header className="min-w-0">
              {crumbs && crumbs.length > 0 && (
                <nav aria-label="অবস্থান" className="crumb">
                  <a href="/">মূলপাতা</a>
                  {crumbs.map((crumb) => (
                    <React.Fragment key={crumb.label}>
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      {crumb.href ? (
                        <a href={crumb.href}>{crumb.label}</a>
                      ) : (
                        <span>{crumb.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </nav>
              )}
              {title && (
                <h1 className="text-[clamp(22px,2.6vw,30px)] leading-tight font-bold tracking-[-0.4px]">
                  {title}
                </h1>
              )}
            </header>
          )}
          {children}
        </main>
      )}
      {bare && mobileDeck ? (
        // The stylesheet hides this wrapper below the dock breakpoint, so only
        // the two deck pages lose the footer on phones; every other page — and
        // the decks on wide screens — keep it exactly as today.
        <div className="deck-chrome-footer">
          <SiteFooter sections={sections} />
        </div>
      ) : (
        <SiteFooter sections={sections} />
      )}
      {/*
        The dock is drawn at every width and reveals itself on a phone, where the
        top bar has handed the desks to the menu; it covers the five primary
        destinations to the menu's full desk list.
      */}
      <MobileDock />
    </>
  );
}
