import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { reportError } from "@/lib/errors";
import { inlineMediaIds } from "@/lib/richtext";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatDateBn, relativeTimeBn, spotlightMediaUrlFor } from "@/lib/site";
import { isSupabaseConfigured, one, supabaseServer } from "@/lib/supabase";

export const revalidate = 60;

/**
 * Postgres casts the `uuid` column before it can compare, so a malformed segment raises
 * `22P02` rather than returning no rows. Validating here turns a bad URL into a clean 404.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A post's description as share-card prose.
 *
 * The description is Markdown now, so the markup has to come off before it reaches an
 * `og:description` — otherwise a shared link advertises `##` and image paths instead of the
 * sentence the author wrote. A story's excerpt does not need this: it is derived by the database,
 * which strips the same markup. Spotlight has no excerpt column, so its one summary is built here.
 */
function plainDescription(markdown: string): string {
  // Every rule is anchored to one line and uses [ \t] rather than \s: `\s` matches a newline too,
  // so a greedy \s* would happily swallow the blank line between two paragraphs and pull the whole
  // description into one run before the table rules even ran.
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}(?:#{1,6}|>)[ \t]?/gm, "")
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, " ")
    .replace(/^[ \t]*[-:| ]+[ \t]*$/gm, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type MediaRow = { position: number; media_id: string };

type SpotlightAuthor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type SpotlightIssue = {
  id: string;
  title: string;
  description: string;
  status: string;
  issue_status: string;
  solver_kind: string | null;
  solver_name: string | null;
  solve_duration: string | null;
  issue_note: string | null;
  marked_at: string | null;
  created_at: string;
  author: SpotlightAuthor | SpotlightAuthor[] | null;
  spotlight_post_media: MediaRow[] | null;
  spotlight_resolution_media: MediaRow[] | null;
};

type IssueEvent = {
  from_status: string | null;
  to_status: string;
  solver_kind: string | null;
  solver_name: string | null;
  solve_duration: string | null;
  note: string | null;
  created_at: string;
};

const DETAIL_SELECT =
  "id,title,description,status,issue_status,solver_kind,solver_name,solve_duration,issue_note,marked_at,created_at,author:profiles!spotlight_posts_author_id_fkey(id,username,display_name,avatar_url),spotlight_post_media(position,media_id),spotlight_resolution_media(position,media_id)";

// The event log is read column-by-column: the marking account is deliberately not granted to a
// public reader, so the record says what was decided and by which body, never by which account.
const EVENT_SELECT =
  "from_status,to_status,solver_kind,solver_name,solve_duration,note,created_at";

const ISSUE_STATUS_LABELS: Record<string, string> = {
  open: "খোলা",
  in_progress: "কাজ চলছে",
  solved: "সমাধান হয়েছে",
  invalid: "ভিত্তিহীন / অপ্রাসঙ্গিক",
};

const ISSUE_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  in_progress: "default",
  solved: "outline",
  invalid: "destructive",
};

const SOLVER_LABELS: Record<string, string> = {
  authority: "প্রশাসন",
  student_wing: "শিক্ষার্থী উইং",
  volunteers: "স্বেচ্ছাসেবক",
  dean_office: "ডিন অফিস",
  hall_authority: "হল প্রশাসন",
  faculty_department: "শিক্ষক / বিভাগ",
  other: "অন্যান্য",
};

const DURATION_LABELS: Record<string, string> = {
  under_1h: "১ ঘণ্টার কম",
  "1_6h": "১–৬ ঘণ্টা",
  "6_24h": "৬–২৪ ঘণ্টা",
  "1_3d": "১–৩ দিন",
  "4_7d": "৪–৭ দিন",
  "1_2w": "১–২ সপ্তাহ",
  "2_4w": "২–৪ সপ্তাহ",
  over_1m: "১ মাসের বেশি",
};

function statusLabel(value: string): string {
  return ISSUE_STATUS_LABELS[value] ?? value;
}

function solverLabel(value: string | null): string {
  if (!value) return "";
  return SOLVER_LABELS[value] ?? value;
}

function durationLabel(value: string | null): string {
  if (!value) return "";
  return DURATION_LABELS[value] ?? value;
}

async function loadIssue(id: string): Promise<SpotlightIssue | null> {
  if (!UUID_PATTERN.test(id) || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabaseServer()
      .from("spotlight_posts")
      .select(DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      reportError("spotlight issue", error);
      return null;
    }
    return (data as unknown as SpotlightIssue | null) ?? null;
  } catch (error) {
    reportError("spotlight issue", error);
    return null;
  }
}

async function loadEvents(id: string): Promise<IssueEvent[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await supabaseServer()
      .from("spotlight_issue_events")
      .select(EVENT_SELECT)
      .eq("post_id", id)
      .order("created_at", { ascending: false });
    if (error) {
      reportError("spotlight issue events", error);
      return [];
    }
    return (data as unknown as IssueEvent[]) ?? [];
  } catch (error) {
    reportError("spotlight issue events", error);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const issue = await loadIssue(id);
  if (!issue) return { title: "ইস্যু পাওয়া যায়নি" };
  const url = `/spotlight/${encodeURIComponent(issue.id)}/`;
  const description = plainDescription(issue.description).slice(0, 160);
  return {
    title: issue.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: `${issue.title} | DUTIMZ`,
      description,
      url,
    },
  };
}

export default async function SpotlightIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issue = await loadIssue(id);
  if (!issue) notFound();

  const events = await loadEvents(issue.id);
  const author = one(issue.author);
  const name =
    author?.display_name?.trim() ||
    (author?.username ? `@${author.username}` : "সদস্য");
  // Pictures placed in the description are drawn by the text itself, so the grid below drops them
  // rather than showing each one twice.
  const inlinePhotos = inlineMediaIds(issue.description, "spotlight");
  const photos = (issue.spotlight_post_media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((photo) => !inlinePhotos.includes(photo.media_id));
  const proof = (issue.spotlight_resolution_media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);
  const decided = issue.issue_status !== "open";

  return (
    <DutimzShell
      title={issue.title}
      crumbs={[
        { label: "স্পটলাইট", href: "/spotlight" },
        { label: issue.title },
      ]}
    >
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={ISSUE_STATUS_VARIANTS[issue.issue_status] ?? "secondary"}
            >
              {statusLabel(issue.issue_status)}
            </Badge>
            {issue.status !== "visible" && (
              <Badge variant="secondary">লুকানো</Badge>
            )}
            <RelativeTime
              value={issue.created_at}
              fallback={relativeTimeBn(issue.created_at)}
              className="text-xs text-muted-foreground"
            />
          </div>
          <CardTitle className="text-2xl leading-snug sm:text-3xl sm:leading-tight">
            {issue.title}
          </CardTitle>
          <div className="flex items-center gap-3 pt-1">
            <Avatar className="size-10">
              {author?.avatar_url && (
                <AvatarImage src={author.avatar_url} alt="" />
              )}
              <AvatarFallback>ঢা</AvatarFallback>
            </Avatar>
            <div className="text-sm">
              {author?.username ? (
                <Link
                  href={`/u/${encodeURIComponent(author.username)}/`}
                  className="font-medium hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <span className="font-medium">{name}</span>
              )}
              <p className="text-xs text-muted-foreground">
                উত্থাপিত {formatDateBn(issue.created_at)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="article-body max-w-[68ch] text-[17px] leading-8">
            <RichTextContent markdown={issue.description} scope="spotlight" />
          </div>
          {photos.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {photos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.media_id}
                  src={spotlightMediaUrlFor(photo.media_id)}
                  alt=""
                  loading="lazy"
                  className="h-auto w-full rounded-lg border object-cover"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {decided && (
        <Card>
          <CardHeader>
            <CardDescription>সমাধান</CardDescription>
            <CardTitle className="text-xl">
              {statusLabel(issue.issue_status)}
              {issue.solver_kind ? ` · ${solverLabel(issue.solver_kind)}` : ""}
              {issue.solver_name ? ` (${issue.solver_name})` : ""}
            </CardTitle>
            {issue.solve_duration && (
              <p className="text-sm text-muted-foreground">
                সময় লেগেছে: {durationLabel(issue.solve_duration)}
              </p>
            )}
            {issue.marked_at && (
              <p className="text-xs text-muted-foreground">
                চিহ্নিত {formatDateBn(issue.marked_at)}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/*
              The resolution note stays plain text, unlike the description above: it is typed into a
              plain textarea in the marking dialog, so a lone `-` or `#` in it must not quietly become
              a list or a heading. Only the post's own description is authored Markdown.
            */}
            {issue.issue_note && (
              <p className="max-w-[68ch] whitespace-pre-line text-sm leading-7">
                {issue.issue_note}
              </p>
            )}
            {proof.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">সমাধানের প্রমাণ</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {proof.map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.media_id}
                      src={spotlightMediaUrlFor(photo.media_id)}
                      alt="সমাধানের প্রমাণ"
                      loading="lazy"
                      className="h-auto w-full rounded-lg border object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                এই সিদ্ধান্তে কোনো ছবি সংযুক্ত হয়নি।
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardDescription>সম্পূর্ণ ইতিহাস</CardDescription>
          <CardTitle className="text-xl">
            অবস্থা বদলের ধারা ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              এখনো কোনো সিদ্ধান্ত নেওয়া হয়নি — ইস্যুটি খোলা আছে।
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {events.map((event, index) => (
                <li
                  key={`${event.created_at}-${index}`}
                  className="flex gap-3 border-l-2 border-border pl-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {(event.from_status
                        ? statusLabel(event.from_status)
                        : "নতুন") +
                        " → " +
                        statusLabel(event.to_status)}
                      {event.solver_kind
                        ? ` · ${solverLabel(event.solver_kind)}`
                        : ""}
                      {event.solver_name ? ` (${event.solver_name})` : ""}
                    </p>
                    {event.solve_duration && (
                      <p className="text-xs text-muted-foreground">
                        সময় লেগেছে: {durationLabel(event.solve_duration)}
                      </p>
                    )}
                    {event.note && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {event.note}
                      </p>
                    )}
                    <time
                      dateTime={event.created_at}
                      className="text-xs text-muted-foreground"
                    >
                      {formatDateBn(event.created_at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/spotlight/">← সব স্পটলাইট ইস্যু</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/statistics/">জবাবদিহির পরিসংখ্যান</Link>
        </Button>
      </div>
    </DutimzShell>
  );
}
