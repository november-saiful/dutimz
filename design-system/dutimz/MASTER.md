# DUTIMZ — Design System (Master)

Source of truth for product-wide visual direction. Generated with the
`ui-ux-pro-max` skill (Node port of its BM25 search — no Python on this
machine; all matches below were verified against
`~/.agents/skills/ui-ux-pro-max/data/*.csv`).
Page-specific overrides live in `pages/` and win over this file.

## Product

Bengali campus news platform (Next.js 15 + React 19 + shadcn + Tailwind v4).
Skill match: `product` → **news-media-platform**
(recommendation: minimalism-swiss + flat; secondary: dark-mode-oled
accessible-ethical; focus: brand colors, high contrast, category colors;
considerations: article layout, breaking news, categories, search,
subscription, mobile reading, fast loading).
Runner-up: `magazine-blog` (storytelling hero, editorial colors, typography
focused, author profiles, newsletter, related content).

## Style

Skill match: `style` → **editorial-grid-magazine** (status: active) +
**minimalism-swiss-style**.
Magazine-grid variables: asymmetric grid, Georgia/Merriweather-class serif
body, bold sans headings, drop caps, pull quotes, 2rem column gap.
Swiss variables: 2rem spacing, 0px radius base, 400/700 weights, no shadow,
single primary accent, 200–250ms subtle hovers.
Accessibility note from both: text 4.5:1, visible keyboard focus,
reduced-motion support.

## Color (brand decision)

Skill match: `color` → news-media-platform (breaking red `dc2626`, link blue
`1e40af`). The site instead uses its own brand, kept deliberately:

| Token | Value | Use |
|---|---|---|
| `--blue` / primary | `#5f2367` | brand, CTAs, dock liquid (10.9:1 white-on-brand) |
| `--purple` | `#7a3d7f` | flags, accents (6.9:1 on shell) |
| `--shell` | `#ffffff` | page background |
| `--card` | `#ece9f0` | surfaces |
| `--ink` | `#1a1220` | primary text (16.8:1) |
| `--body` | `#453c4a` | body text (9.7:1) |
| `--muted` / muted-foreground | `#6b6376` | secondary text — 5.3:1 shell, 5.7:1 white, 4.8:1 card (was `#948c9e` at 3.0:1, fixed 2026-10-14) |
| `--line` | `#e3dfe7` | borders |
| destructive | `#d33b4e` | danger only, with icon/text (never color alone) |
| success | `#2f9e5f` | confirmations only, with icon/text |

Theme: light-only by brand decision (`color-scheme: light`). No dark theme
is shipped, so dark-mode parity is out of scope until a theme is added.
Rules: semantic tokens only, no raw hex in components; one accent
(`--blue`); functional color always paired with icon/text.

## Typography

Skill match: `typography` → **news-editorial** (Newsreader headings + Roboto
body). The database has no Bengali pairing, so the site decision wins:
**Noto Serif Bengali** (self-hosted via `next/font`, `display: swap`,
bengali + latin subsets) sets Bengali, Latin, numerals, and wordmark —
one face, zero external font hosts. Scale: 12 / 14 / 16 / 18 / 24 / 32,
body 16px min on mobile, line-height 1.5–1.75, Bengali label tracking −0.1px.

## Dials

- `--variance` 4 (balanced/modern; editorial grid gives the asymmetry)
- `--motion` 4 (standard; shared tokens `--dock-ease`, `--dock-lead-ease`,
  `--dock-trail-ease`, `--menu-ease`; global reduced-motion reset collapses
  all durations — intentional)
- `--density` 5 (standard; 4/8pt rhythm, tiers 16/24/32/48)

## Motion rules

Transform/opacity only for animation (the dock-blob `width` transition is the
single documented exception — it tracks the measured tab box). Exits run
~60–70% of enters. Press feedback: dock tab `scale(0.94)`, menu close
rotate, sub-100ms tap response. No endless loops. Carousel auto-advance
stops on reduced-motion/focus.

## Layout & navigation

Mobile-first; breakpoints 600 / 860 / 1020; max width `--maxw: 1240px`.
Phone dock (≤860px) carries 4 destinations + create action; menu keeps the
full desk list. Fixed chrome reserves space (`body padding-bottom: var(--dock)`
on phones). z-scale: dock 40, scrims/sheets 50, top bar 60.
Deep links for every desk/article/issue/profile; breadcrumbs on 3+ level
hierarchies; back preserves scroll/filter state.

## Accessibility baseline (verified 2026-10-14)

Skip link (`মূল লেখায় যান` → `#main-content`), `focus-visible` rings on all
interactive elements, icon-only buttons carry Bengali `aria-label`s,
decorative icons use `aria-hidden`, form errors use live regions, `lang="bn"`,
no `maximum-scale`/`user-scalable=no` (zoom intact), `aria-current="page"` on
the current dock tab, touch targets ≥24px WCAG AA everywhere with 44pt Apple
guidance as the target for new work.

## Known exceptions (documented, not debt)

- Plain `<img>` (not `next/image`) where the media host needs a bearer token
  (`authed-media-image`, rich-text content, avatars) — `next/image` cannot
  sign those requests. `story-card` and galleries use `next/image`.
- Small controls below 44pt but above WCAG 24px (`menu-logout` 32px,
  `menu-close` 34px, gallery arrows 36px) — acceptable under WCAG 2.2 AA
  target-size; enlarge to 44pt when those rows are next redesigned.
- Dock liquid has no flight on cross-page taps: `MobileDock` remounts with
  each page (per-page shell), so the new copy lands placed by design.
