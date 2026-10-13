/*
  `turndown-plugin-gfm` ships no type declarations (v1.0.2 has no .d.ts and no `types` field), so
  TypeScript reports TS7016 for the dynamic import that loads it. The package's ES build exports
  exactly these five functions; each one takes the Turndown service and registers its rules.

  The parameter is `unknown` rather than the service type on purpose: this file only has to tell
  TypeScript that the module exists and what it exports, so it should not have to agree with
  @types/turndown about anything.
*/
declare module "turndown-plugin-gfm" {
  /** Tables, strikethrough and task lists — the GitHub Flavored Markdown rules. */
  export function gfm(service: unknown): void;
  export function tables(service: unknown): void;
  export function strikethrough(service: unknown): void;
  export function taskListItems(service: unknown): void;
  export function highlightedCodeBlock(service: unknown): void;
}
