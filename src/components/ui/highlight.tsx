'use client';

interface HighlightProps {
  text: string;
  query: string;
  className?: string;
}

/**
 * Renders `text` with every occurrence of `query` wrapped in a `<mark>`.
 * Case-insensitive. Returns the plain text if query is empty.
 */
export function Highlight({ text, query, className }: HighlightProps) {
  if (!query || !text) {
    return <>{text}</>;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="rounded-sm bg-[#5f2367]/15 px-0.5 text-inherit font-bold dark:bg-[#dbbce0]/20"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </span>
  );
}
