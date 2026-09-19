import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HaloReel, type HaloReelItem } from "@/components/ui/halo-reel";

// Motion's cards call useLayoutEffect, which React warns about on every server
// render. That is expected here (the app server-renders this component too),
// and the warning would otherwise bury anything the tests report.
const realConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("useLayoutEffect does nothing on the server")
    ) {
      return;
    }
    realConsoleError(...args);
  };
});
afterAll(() => {
  console.error = realConsoleError;
});

/**
 * Rendering the ring server-side is also the "stage has not been measured
 * yet" case, which is where the card count used to collapse — so these tests
 * cover first paint and the thin-feed bug in one place.
 */

function items(count: number): HaloReelItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Story ${i}`,
    href: `/news/story-${i}`,
  }));
}

function slides(markup: string): number {
  return (markup.match(/aria-roledescription="slide"/g) ?? []).length;
}

describe("HaloReel", () => {
  it("gives every item a slot on the ring", () => {
    // Seven categories' worth of stories. A ring sized by the measured stage
    // renders only what fits, dropping the tail silently — and the dropped
    // card is unreachable by drag or autoplay.
    expect(slides(renderToStaticMarkup(<HaloReel items={items(7)} />))).toBe(7);
  });

  it("renders the same ring before the stage has been measured", () => {
    expect(slides(renderToStaticMarkup(<HaloReel items={items(3)} />))).toBe(3);
  });

  it("is a single card for a single story", () => {
    expect(slides(renderToStaticMarkup(<HaloReel items={items(1)} />))).toBe(1);
  });

  it("cuts the tail at maxCards, and only then", () => {
    const markup = renderToStaticMarkup(<HaloReel items={items(12)} maxCards={5} />);
    expect(slides(markup)).toBe(5);
  });

  it("renders the centre label beside the ring", () => {
    const markup = renderToStaticMarkup(
      <HaloReel items={items(3)} centerLabel={<h2>শিরোনাম</h2>} />,
    );
    expect(markup).toContain("শিরোনাম");
  });

  it("renders nothing without items", () => {
    expect(renderToStaticMarkup(<HaloReel items={[]} />)).toBe("");
  });
});
