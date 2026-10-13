import type { ComponentType } from "react";

import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { mediaIdAt, type MediaScope } from "@/lib/richtext";
import { mediaUrlFor, spotlightMediaUrlFor } from "@/lib/site";
import { cn } from "@/lib/utils";

/*
  One renderer for every piece of authored text on the site.

  A story body, a Spotlight description, a pending submission under review and the desk's preview of
  it are all Markdown, and all of them are drawn here, so a writer can never be shown a page that
  looks different from the one their reader gets.

  It returns React elements and never injects HTML. `react-markdown` does not render raw HTML
  unless `rehype-raw` is added — it does not belong here — and it runs every URL through its default
  transform, which permits relative URLs and the usual web protocols and refuses `javascript:` and
  `data:`. That is the whole stored-XSS story, and it holds without a sanitizer dependency.

  Pictures are the one thing it will not pass through: only a reference to media this account
  uploaded resolves, and anything else is dropped rather than pointed at a third-party host.
*/
export function RichTextContent({
  markdown,
  scope = "article",
  className,
  Image,
}: {
  markdown: string | null | undefined;
  scope?: MediaScope;
  className?: string;
  /*
    How a picture is actually fetched.

    The default points an `<img>` straight at the media host, which is right for anything a
    signed-out reader is allowed to see: a published story's picture is public. It is wrong for the
    surfaces that show text which is NOT public yet — the pending submission a reviewer reads, the
    desk's preview of it, and the composer's own preview.

    The media host resolves an unpublished story's pictures only for their owner and the desk, and
    only when the request carries a bearer token, which a plain `<img>` cannot send. Those surfaces
    pass `AuthedMediaImage`, which fetches with the reader's live token instead. Without this the
    private previews showed a hero and a gallery that loaded next to inline pictures that did not.
  */
  Image?: ComponentType<{
    mediaId: string;
    alt: string;
    scope: MediaScope;
    className?: string;
  }>;
}) {
  if (!markdown?.trim()) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          img: ({ src, alt }) => {
            const id = mediaIdAt(src, scope);
            // Not one of ours: drop it. A pasted web picture would otherwise leak the reader's
            // request (and their address) to whoever hosts it.
            if (!id) return null;
            const label = typeof alt === "string" ? alt : "";
            const className =
              "my-5 h-auto w-full rounded-xl border object-cover";
            if (Image)
              return (
                <Image mediaId={id} alt={label} scope={scope} className={className} />
              );
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  scope === "spotlight"
                    ? spotlightMediaUrlFor(id)
                    : mediaUrlFor(id)
                }
                alt={label}
                loading="lazy"
                decoding="async"
                className={className}
              />
            );
          },
          // A wide table scrolls inside its own box rather than pushing the whole page sideways.
          table: ({ children }) => (
            <div className="my-5 w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          a: ({ href, children }) => {
            const external = /^https?:\/\//i.test(href ?? "");
            return (
              <a
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-primary underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
