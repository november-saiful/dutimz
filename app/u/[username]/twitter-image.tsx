/*
  The same share card, for the other scraper.

  Next fills `twitter:image` from the `opengraph-image` file *only* when the route
  leaves the twitter namespace alone — and this one does not: the root layout sets
  `twitter.images`, which kept winning, so a profile posted to X still previewed as
  the site's generic banner while `og:image` already showed the member's card. A
  file of its own makes the card the route's answer in both namespaces, and
  re-exporting keeps one drawing rather than two that can drift apart.
*/

export { alt, size, contentType, default } from "./opengraph-image";
