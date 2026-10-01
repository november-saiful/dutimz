"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { bn, formatDateBn } from "@/lib/site";

type Member = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  reporter_tier: string | null;
  completion_percent: number;
  created_at: string;
  total_count: number;
};

type Withdrawal = {
  id: string;
  user_id: string;
  amount_tk: number;
  method: string;
  status: string;
  created_at: string;
  profiles: { username: string; display_name: string } | null;
};

type SpotlightPost = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  author:
    | { username: string; display_name: string }
    | { username: string; display_name: string }[]
    | null;
};

type SortState = {
  column: string;
  direction: "ascending" | "descending";
};

/**
 * The rule the audited member-record RPC applies to a username, mirrored here.
 *
 * Reader-facing errors in this app never render a provider or database message — `@/lib/errors`
 * deliberately swaps them for operation-specific Bengali text — so a validation refusal coming
 * back from `admin_update_member` looks exactly like a failed connection. The desk was left
 * staring at "the username could not be updated" with no way to tell a taken handle from a
 * disallowed character. The server stays the authority; this only answers the common mistake
 * before the round trip, and names the rule either way.
 */
const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/;

/**
 * What gets logged when the desk leaves the reason blank.
 *
 * The audited RPCs require a reason so that no role change or member edit lands unaccounted
 * for. The form no longer forces the desk to type one, so a blank field records that none was
 * given — rather than an empty string the notification trigger would refuse.
 */
const NO_REASON = "কারণ উল্লেখ করা হয়নি";

const ROLE_LABELS: Record<string, string> = {
  reader: "রিডার",
  reporter: "রিপোর্টার",
  moderator: "মডারেটর",
  admin: "অ্যাডমিন",
};

const TIER_LABELS: Record<string, string> = {
  junior: "জুনিয়র",
  general: "জেনারেল",
  executive: "এক্সিকিউটিভ",
};

function roleBadgeVariant(
  role: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (role) {
    case "admin":
      return "destructive";
    case "moderator":
      return "secondary";
    case "reporter":
      return "default";
    default:
      return "outline";
  }
}

function SortableHead({
  id,
  label,
  sort,
  onSort,
  className,
}: {
  id: string;
  label: string;
  sort: SortState;
  onSort: (column: string) => void;
  className?: string;
}) {
  const active = sort.column === id;
  const Icon = active
    ? sort.direction === "ascending"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={
        active
          ? sort.direction === "ascending"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => onSort(id)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`${label} অনুযায়ী সাজান`}
      >
        {label}
        <Icon className="size-3.5 opacity-60" aria-hidden />
      </button>
    </TableHead>
  );
}

export function AdminDashboard() {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [tab, setTab] = React.useState<"members" | "spotlight" | "finance">("members");
  const [query, setQuery] = React.useState("");
  const [members, setMembers] = React.useState<Member[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [withdrawals, setWithdrawals] = React.useState<Withdrawal[]>([]);
  const [spotlight, setSpotlight] = React.useState<SpotlightPost[]>([]);
  const [spotlightReasons, setSpotlightReasons] = React.useState<Record<string, string>>({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [adjustUserId, setAdjustUserId] = React.useState("");
  const [adjustAmount, setAdjustAmount] = React.useState("");
  const [adjustReason, setAdjustReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortState>({
    column: "created_at",
    direction: "descending",
  });
  const [editing, setEditing] = React.useState<Member | null>(null);
  const [editUsername, setEditUsername] = React.useState("");
  const [editRole, setEditRole] = React.useState("reporter");
  const [editTier, setEditTier] = React.useState("general");
  const [editReason, setEditReason] = React.useState("");

  const pageSize = 20;

  const loadMembers = React.useCallback(
    async (nextOffset: number, nextQuery: string) => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.rpc("admin_member_records", {
          p_query: nextQuery.trim() || null,
          p_limit: pageSize,
          p_offset: nextOffset,
        });
        if (error) {
          setError(
            errorMessage(
              "admin member records",
              error,
              "সদস্যদের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।",
            ),
          );
          return;
        }
        const rows = (data as Member[] | null) ?? [];
        setMembers(rows);
        setTotal(Number(rows[0]?.total_count ?? 0));
        setOffset(nextOffset);
      } catch (err) {
        setError(errorMessage("admin member records", err, "সদস্যদের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।"));
      }
    },
    [],
  );

  const loadSpotlight = React.useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      // The desk read policy returns hidden posts too, which is the point.
      const { data, error } = await supabase
        .from("spotlight_posts")
        .select(
          "id,title,description,status,created_at,author:profiles!spotlight_posts_author_id_fkey(username,display_name)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) {
        setError(
          errorMessage(
            "admin spotlight posts",
            error,
            "স্পটলাইট পোস্টগুলো লোড করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setSpotlight((data as unknown as SpotlightPost[]) ?? []);
    } catch (err) {
      setError(errorMessage("admin spotlight posts", err, "স্পটলাইট পোস্টগুলো লোড করা যায়নি। আবার চেষ্টা করুন।"));
    }
  }, []);

  const loadWithdrawals = React.useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase
        .from("withdrawals")
        .select(
          "id,user_id,amount_tk,method,status,created_at,profiles:profiles!withdrawals_user_id_fkey(username,display_name)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(60);
      if (error) {
        setError(
          errorMessage(
            "admin withdrawal requests",
            error,
            "উত্তোলনের অনুরোধগুলো লোড করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setWithdrawals((data as unknown as Withdrawal[]) ?? []);
    } catch (err) {
      setError(errorMessage("admin withdrawal requests", err, "উত্তোলনের অনুরোধগুলো লোড করা যায়নি। আবার চেষ্টা করুন।"));
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setError(errorMessage("admin session", authError, "অনুমতি যাচাই করা যায়নি। আবার চেষ্টা করুন।"));
          if (!cancelled) setAllowed(false);
          return;
        }
        if (!user) {
          if (!cancelled) setAllowed(false);
          return;
        }
        const { data, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (roleError) {
          setError(errorMessage("admin role lookup", roleError, "অনুমতি যাচাই করা যায়নি। আবার চেষ্টা করুন।"));
          if (!cancelled) setAllowed(false);
          return;
        }
        if (cancelled) return;
        if ((data as { role?: string } | null)?.role !== "admin") {
          setAllowed(false);
          return;
        }
        setAllowed(true);
        await loadMembers(0, "");
        await loadWithdrawals();
        await loadSpotlight();
      } catch (err) {
        if (!cancelled) {
          setError(
            errorMessage(
              "admin dashboard",
              err,
              "ড্যাশবোর্ডের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।",
            ),
          );
          setAllowed(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMembers, loadWithdrawals, loadSpotlight]);

  async function reviewWithdrawal(id: string, decision: "approve" | "reject") {
    const reason = (reasons[id] ?? "").trim();
    if (reason.length < 3) {
      setError("সিদ্ধান্তের কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
    setBusy(id);
    setError("");
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.rpc("review_withdrawal", {
        p_withdrawal_id: id,
        p_decision: decision,
        p_reason: reason,
      });
      if (error) {
        setError(
          errorMessage(
            "withdrawal review",
            error,
            "সিদ্ধান্ত নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setNotice("উত্তোলনের সিদ্ধান্ত নথিভুক্ত হয়েছে।");
      await loadWithdrawals();
    } catch (err) {
      setError(errorMessage("withdrawal review", err, "সিদ্ধান্ত নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  async function moderateSpotlight(post: SpotlightPost, decision: "hide" | "restore" | "remove") {
    const reason = (spotlightReasons[post.id] ?? "").trim();
    if (reason.length < 3) {
      setError("সিদ্ধান্তের কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
    setBusy(`spotlight-${post.id}`);
    setError("");
    setNotice("");
    try {
      const { error } = await supabaseBrowser().rpc("admin_set_spotlight_status", {
        p_post_id: post.id,
        p_decision: decision,
        p_reason: reason,
      });
      if (error) {
        setError(
          errorMessage(
            "spotlight moderation",
            error,
            "সিদ্ধান্ত নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setNotice("স্পটলাইট পোস্টের সিদ্ধান্ত নথিভুক্ত হয়েছে।");
      await loadSpotlight();
    } catch (err) {
      setError(errorMessage("spotlight moderation", err, "সিদ্ধান্ত নথিভুক্ত করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  async function adjustBalance(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const amountTk = Number(adjustAmount);
    if (!adjustUserId.trim() || !Number.isInteger(amountTk) || adjustReason.trim().length < 3) {
      setError("সদস্যের আইডি, পূর্ণসংখ্যা পরিমাণ ও কারণ আবশ্যক।");
      return;
    }
    setBusy("adjust");
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.rpc("admin_adjust_balance", {
        p_user_id: adjustUserId.trim(),
        p_amount_tk: amountTk,
        p_reason: adjustReason.trim(),
      });
      if (error) {
        setError(
          errorMessage(
            "balance adjustment",
            error,
            "জমা অর্থ সমন্বয় করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setNotice("জমা অর্থ সমন্বয় করা হয়েছে।");
      setAdjustUserId("");
      setAdjustAmount("");
      setAdjustReason("");
    } catch (err) {
      setError(errorMessage("balance adjustment", err, "জমা অর্থ সমন্বয় করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  // The server page is the unit the RPC returns, so sorting applies to the
  // loaded page exactly like the reference table sorts its loaded items.
  const sortedMembers = React.useMemo(() => {
    const factor = sort.direction === "descending" ? -1 : 1;
    const valueOf = (member: Member): string | number => {
      switch (sort.column) {
        case "name":
          return (member.display_name || member.username).toLowerCase();
        case "role":
          return member.role;
        case "tier":
          return member.reporter_tier ?? "";
        case "completion":
          return member.completion_percent;
        case "created_at":
        default:
          return member.created_at;
      }
    };
    return [...members].sort((a, b) => {
      const first = valueOf(a);
      const second = valueOf(b);
      if (typeof first === "number" && typeof second === "number") {
        return (first - second) * factor;
      }
      return String(first).localeCompare(String(second)) * factor;
    });
  }, [members, sort]);

  function toggleSort(column: string) {
    setSort((prev) =>
      prev.column === column
        ? {
            column,
            direction: prev.direction === "ascending" ? "descending" : "ascending",
          }
        : { column, direction: "ascending" },
    );
  }

  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageWindow = React.useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
  }, [page, totalPages]);

  function openEditor(member: Member) {
    setEditing(member);
    setEditUsername(member.username);
    setEditRole(member.role);
    setEditTier(member.reporter_tier ?? "general");
    setEditReason("");
  }

  // Role editing happens on the member's own row now: the audited RPC needs
  // the member id, which the table already holds, so no UUID pasting.
  async function saveRole() {
    if (!editing) return;
    setError("");
    setNotice("");
    // A reason is optional now: a blank field records that none was given.
    const reason = editReason.trim() || NO_REASON;
    // The username is a stable public handle, so only the desk can change it — through the
    // audited member-record RPC. The same rule is applied here first, because that RPC's
    // refusal arrives as fixed Bengali text that says nothing about what was wrong.
    const nextUsername = editUsername.trim();
    const changingUsername =
      Boolean(nextUsername) && nextUsername !== editing.username;
    if (changingUsername && !USERNAME_PATTERN.test(nextUsername)) {
      setError(
        "ইউজারনেম ৩–২৪ অক্ষরের হতে হবে: ইংরেজি অক্ষর, সংখ্যা বা আন্ডারস্কোর, প্রথমে ইংরেজি অক্ষর।",
      );
      return;
    }

    setBusy(`role-${editing.id}`);
    try {
      const supabase = supabaseBrowser();
      if (changingUsername) {
        const { error: usernameError } = await supabase.rpc("admin_update_member", {
          p_user_id: editing.id,
          p_profile: { username: nextUsername },
          p_details: {},
          p_reason: reason,
        });
        if (usernameError) {
          setError(
            errorMessage(
              "username update",
              usernameError,
              "ইউজারনেম হালনাগাদ করা যায়নি। আবার চেষ্টা করুন।",
            ),
          );
          return;
        }
      }
      const { error } = await supabase.rpc("assign_user_role", {
        p_user_id: editing.id,
        p_role: editRole,
        p_tier: editRole === "reporter" ? editTier : null,
        p_reason: reason,
      });
      if (error) {
        setError(
          errorMessage(
            "role assignment",
            error,
            "ভূমিকা হালনাগাদ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setNotice("ভূমিকা হালনাগাদ হয়েছে।");
      setEditing(null);
      await loadMembers(offset, query);
    } catch (err) {
      setError(errorMessage("role assignment", err, "ভূমিকা হালনাগাদ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  if (allowed === null) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          অনুমতি যাচাই করা হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {error ? <p className="text-destructive" role="alert">{error}</p> : "এই প্রশাসনিক ড্যাশবোর্ড কেবল অ্যাডমিনদের জন্য।"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-success" role="status">
          {notice}
        </p>
      )}
      <div className="flex gap-2" role="tablist" aria-label="প্রশাসনিক বিভাগ">
        {(
          [
            ["members", "সদস্য"],
            ["spotlight", "স্পটলাইট"],
            ["finance", "অর্থ"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "members" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>সদস্য তালিকা (মোট {bn(total)}জন)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <form
                className="flex items-start gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void loadMembers(0, query);
                }}
              >
                <Field
                  label="সদস্য খুঁজুন"
                  htmlFor="member-search"
                  hideLabel
                  className="min-w-0 flex-1"
                >
                  <Input
                    id="member-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="নাম বা ইউজারনেম খুঁজুন…"
                  />
                </Field>
                <Button type="submit">খুঁজুন</Button>
              </form>
              <Table aria-label="সদস্য তালিকা">
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      id="name"
                      label="সদস্য"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      id="role"
                      label="ভূমিকা"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      id="tier"
                      label="স্তর"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      id="completion"
                      label="সম্পূর্ণ"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      id="created_at"
                      label="যোগদান"
                      sort={sort}
                      onSort={toggleSort}
                      className="hidden md:table-cell"
                    />
                    <TableHead className="w-12">
                      <span className="sr-only">পদক্ষেপ</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        কোনো সদস্য পাওয়া যায়নি।
                      </TableCell>
                    </TableRow>
                  )}
                  {sortedMembers.map((member) => {
                    const name = member.display_name || `@${member.username}`;
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-8 shrink-0">
                              <AvatarFallback className="text-xs">
                                {name.replace(/^@/, "").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                @{member.username}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(member.role)}>
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {member.reporter_tier ? (
                            <Badge variant="secondary">
                              {TIER_LABELS[member.reporter_tier] ??
                                member.reporter_tier}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {bn(member.completion_percent)}%
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                          {formatDateBn(member.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditor(member)}
                            aria-label={`${name}-এর ভূমিকা সম্পাদনা`}
                            title="ভূমিকা সম্পাদনা"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <nav
                className="flex flex-wrap items-center justify-center gap-1"
                aria-label="সদস্য পৃষ্ঠা"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => void loadMembers((page - 2) * pageSize, query)}
                  aria-label="আগের পৃষ্ঠা"
                >
                  ←
                </Button>
                {pageWindow.map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => void loadMembers((p - 1) * pageSize, query)}
                    aria-label={`পৃষ্ঠা ${p}`}
                    aria-current={p === page ? "page" : undefined}
                  >
                    {bn(p)}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => void loadMembers(page * pageSize, query)}
                  aria-label="পরের পৃষ্ঠা"
                >
                  →
                </Button>
              </nav>
            </CardContent>
          </Card>

          <Dialog
            open={editing !== null}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ভূমিকা সম্পাদনা</DialogTitle>
                <DialogDescription>
                  {editing && (
                    <>
                      @{editing.username} — বর্তমান ভূমিকা:{" "}
                      {ROLE_LABELS[editing.role] ?? editing.role}
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <Field
                  label="ইউজারনেম"
                  htmlFor="edit-username"
                  hint="কেবল ইংরেজি অক্ষর, সংখ্যা ও আন্ডারস্কোর (৩–২৪), প্রথমে ইংরেজি অক্ষর — এটি প্রোফাইলের ঠিকানা।"
                >
                  <Input
                    id="edit-username"
                    value={editUsername}
                    maxLength={24}
                    onChange={(e) => setEditUsername(e.target.value)}
                  />
                </Field>
                <Field label="ভূমিকা" htmlFor="edit-role">
                  <Select
                    id="edit-role"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                  >
                    <option value="reader">রিডার</option>
                    <option value="reporter">রিপোর্টার</option>
                    <option value="moderator">মডারেটর</option>
                    <option value="admin">অ্যাডমিন</option>
                  </Select>
                </Field>
                {editRole === "reporter" && (
                  <Field label="রিপোর্টার স্তর" htmlFor="edit-tier">
                    <Select
                      id="edit-tier"
                      value={editTier}
                      onChange={(e) => setEditTier(e.target.value)}
                    >
                      <option value="junior">জুনিয়র</option>
                      <option value="general">জেনারেল</option>
                      <option value="executive">এক্সিকিউটিভ</option>
                    </Select>
                  </Field>
                )}
                <Field
                  label="কারণ (ঐচ্ছিক)"
                  htmlFor="edit-reason"
                  hint="খালি রাখলে অডিট লগে লেখা থাকবে যে কারণ দেওয়া হয়নি।"
                >
                  <Textarea
                    id="edit-reason"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="কেন এই ভূমিকা দেওয়া হচ্ছে… (ঐচ্ছিক)"
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  বাতিল
                </Button>
                <Button onClick={() => void saveRole()} disabled={busy !== null}>
                  {busy !== null ? "সংরক্ষণ হচ্ছে…" : "ভূমিকা সংরক্ষণ করুন"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {tab === "spotlight" && (
        <Card>
          <CardHeader>
            <CardTitle>স্পটলাইট পোস্ট ({bn(spotlight.length)}টি)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {spotlight.length === 0 && (
              <p className="text-sm text-muted-foreground">
                এখনো কোনো স্পটলাইট পোস্ট নেই।
              </p>
            )}
            {spotlight.map((post) => {
              const author = Array.isArray(post.author) ? post.author[0] : post.author;
              const name =
                author?.display_name?.trim() ||
                (author?.username ? `@${author.username}` : "সদস্য");
              const hidden = post.status !== "visible";
              return (
                <div key={post.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{post.title}</p>
                    <Badge variant={hidden ? "secondary" : "outline"}>
                      {hidden ? "লুকানো" : "দৃশ্যমান"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {name} · {formatDateBn(post.created_at)}
                  </p>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {post.description}
                  </p>
                  <div className="mt-2 grid gap-2">
                    <Field
                      label="সিদ্ধান্তের কারণ (আবশ্যক)"
                      htmlFor={`sreasons-${post.id}`}
                      hint="কারণ অডিট লগে সংরক্ষিত হয়।"
                    >
                      <Textarea
                        id={`sreasons-${post.id}`}
                        value={spotlightReasons[post.id] ?? ""}
                        onChange={(e) =>
                          setSpotlightReasons({
                            ...spotlightReasons,
                            [post.id]: e.target.value,
                          })
                        }
                        rows={2}
                        minLength={3}
                        maxLength={500}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      {hidden ? (
                        <Button
                          size="sm"
                          disabled={busy === `spotlight-${post.id}`}
                          onClick={() => void moderateSpotlight(post, "restore")}
                        >
                          পুনরুদ্ধার
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy === `spotlight-${post.id}`}
                          onClick={() => void moderateSpotlight(post, "hide")}
                        >
                          লুকান
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === `spotlight-${post.id}`}
                        onClick={() => void moderateSpotlight(post, "remove")}
                      >
                        মুছে ফেলুন
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {tab === "finance" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                অপেক্ষমাণ উত্তোলন ({bn(withdrawals.length)}টি)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {withdrawals.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  নিষ্পত্তির অপেক্ষায় কোনো অনুরোধ নেই।
                </p>
              )}
              {withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="rounded-md border p-4">
                  <p className="text-sm font-medium">
                    {withdrawal.profiles?.display_name ??
                      `@${withdrawal.profiles?.username ?? "সদস্য"}`}{" "}
                    · {bn(withdrawal.amount_tk)} টাকা ·{" "}
                    {withdrawal.method === "nagad" ? "নগদ" : "বিকাশ"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateBn(withdrawal.created_at)}
                  </p>
                  <div className="mt-2 grid gap-2">
                    <Field
                      label="সিদ্ধান্তের কারণ (আবশ্যক)"
                      htmlFor={`wreason-${withdrawal.id}`}
                      hint="কারণ অডিট লগে সংরক্ষিত হয়।"
                    >
                      <Textarea
                        id={`wreason-${withdrawal.id}`}
                        value={reasons[withdrawal.id] ?? ""}
                        onChange={(e) =>
                          setReasons({
                            ...reasons,
                            [withdrawal.id]: e.target.value,
                          })
                        }
                        rows={2}
                        minLength={3}
                        maxLength={500}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy === withdrawal.id}
                        onClick={() => void reviewWithdrawal(withdrawal.id, "approve")}
                      >
                        পরিশোধ
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === withdrawal.id}
                        onClick={() => void reviewWithdrawal(withdrawal.id, "reject")}
                      >
                        প্রত্যাখ্যান
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>জমা অর্থ সমন্বয়</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={adjustBalance} className="flex flex-col gap-4">
                <FieldGrid>
                  <Field
                    label="সদস্যের আইডি (UUID)"
                    htmlFor="adjust-user"
                  >
                    <Input
                      id="adjust-user"
                      value={adjustUserId}
                      onChange={(e) => setAdjustUserId(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="পরিমাণ (টাকা, ঋণাত্মক হতে পারে)"
                    htmlFor="adjust-amount"
                  >
                    <Input
                      id="adjust-amount"
                      type="number"
                      step={1}
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="কারণ (আবশ্যক)"
                    htmlFor="adjust-reason"
                    hint="কারণ অডিট লগে সংরক্ষিত হয়।"
                  >
                    <Textarea
                      id="adjust-reason"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      rows={2}
                      minLength={3}
                      maxLength={500}
                    />
                  </Field>
                </FieldGrid>
                <Button
                  type="submit"
                  disabled={busy === "adjust"}
                  className="self-start"
                >
                  সমন্বয় সংরক্ষণ করুন
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
