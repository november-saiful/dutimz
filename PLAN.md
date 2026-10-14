# Immersive mobile flipps deck — implementation plan

## Goal
On the flipps deck surfaces only — `/flipps/` and the shared `/flipps/[slug]/` decks — make the mobile view a full-bleed immersive reel feed.

**On mobile, inside those two routes, the page should read as:**
- top bar (sticky `DashboardHeader`)
- the reel feed filling the space between the bars
- bottom dock (`MobileDock`)

**Mobile immersive deck must not have:**
- site footer
- the centered/max-width page wrapper
- side padding that frames the deck as a column
- the deck's card looking like a bordered card sitting inside a shell — it should feel like a full-screen reel card, not a card in a page

**Out of scope:**
- article pages a reel card links to
- anything outside the two deck routes

## Why this is possible now
- Both deck pages already wrap themselves in `<DutimzShell bare>` — `bare` is the shell flavor whose whole job is "the page draws its own container, shell just contributes chrome".
- `components/flipps/flipps-reels.tsx` already sizes the reel column from `100svh` minus `--topbar`, `--dock`, and the wrapper's own padding. So the feed math is already written with mobile full-viewport in mind.
- `app/globals.css` already reserves `--dock` space on mobile and pads `body` at the bottom for the floating dock.

The gap is that `bare` still unconditionally renders `SiteFooter`, still renders `MobileDock` at all widths, and the two deck pages still hand their content through the centered `mx-auto ... max-w-[var(--maxw)] px-4 py-3` wrapper. So on mobile you still get page chrome around the deck.

## Decision made
- Immersive mode is only for the two deck pages.
- Immersive mode is phones only — the same breakpoint the site already uses for the mobile dock and the collapsed top-bar nav, so we don't invent a new width rule. On wider screens the existing desktop split (reel column + detail pane) stays.
- The cleanest implementation is a shell variant for mobile flipps decks: the deck pages opt in to "bare + mobile deck", and the shell drops footer/page-wrapper chrome only in that combination. We do not make every `bare` page behave differently; flipps decks are special.

## Files to change
1. `components/dashboard/dutimz-shell.tsx`
   - Add a way for a `bare` page to say "this is a mobile deck page".
   - In that combination, on mobile:
     - do not render `<SiteFooter>`
     - keep `<MobileDock>` (it's supposed to stay)
     - keep `<DashboardHeader>`
     - do not wrap the children in the centered `mx-auto ... max-w-[var(--maxw)] ... px-4 py-3` container; render children full-bleed as the main content
   - On wider screens, keep current `bare` behavior unchanged.

2. `app/flipps/page.tsx`
   - Opt the deck page into the mobile-deck shell variant.
   - Remove or neutralize the centered wrapper here when mobile deck mode is active — the shell should own that, not this page.

3. `app/flipps/[slug]/page.tsx`
   - Same opt-in, same wrapper neutralization.

4. `components/flipps/flipps-reels.tsx`
   - On mobile, the reel card should stop reading as a bordered rounded card framed by the page.
   - The existing full-bleed card body already exists (`absolute inset-0 size-full` story art + scrim + content overlay). The change is the outer card frame: on mobile it should not carry the page-shell border/rounding that makes it look like a card in a column.
   - Keep the desktop card frame; only change the mobile card frame.
   - Keep the tap-to-open sheet behavior on mobile; keep the desktop side pane behavior.

5. `app/globals.css`
   - Only if the plan needs a small mobile-deck hook that the existing `--dock` / `--topbar` variables don't already cover.
   - Prefer reusing existing mobile chrome variables rather than adding new ones.

## What must stay working
- Desktop flipps: reel column + detail pane split unchanged.
- Shared deck: shared reel leads the deck, then newest reels after it.
- Keyboard nav, snap scroll, ResizeObserver re-align, progress counter.
- Tap a reel on mobile: opens the bottom detail sheet, not a card link navigation.
- Bottom sheet still accounts for `safe-area-inset-bottom`.
- Dock and top bar still behave exactly as today on every page; only the two deck pages lose footer/page-wrapper chrome on mobile.

## Acceptance criteria
1. Open `/flipps/` on a mobile-width viewport: no footer, no centered page wrapper, no side padding framing the deck, deck fills the space between the top bar and the dock.
2. Open a shared deck `/flipps/<slug>/` on mobile: same immersive treatment, shared reel leads the deck.
3. Desktop width: flipps pages look exactly as before — no regressions to the reel + detail pane layout.
4. The reel card on mobile looks like a full-bleed reel surface, not a bordered card inside a page column.
5. The dock and top bar remain present and unchanged on the mobile deck pages.
6. No footer on the mobile deck pages; footer remains on every other page.
7. No broken behavior from the sheet, snap scroll, counter, or resize re-align on mobile.

## Verification approach
- Run the existing UI smoke and overflow tests after the change; they already touch flipps pages.
- Visually check a mobile-width viewport for both deck pages: no footer, full-bleed deck, two chrome bars only.
- Visually check desktop width for both deck pages: unchanged.

## Notes
- Do not ship a separate route or a separate page component for this. The two deck pages already exist; the difference is which shell chrome they get on mobile.
- Do not make `bare` globally special. Only the flipps deck pages should lose footer/wrapper chrome on mobile.
- Do not touch article pages; a reel card linking out to its article keeps the article layout.
