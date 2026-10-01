"use client";

import Link from "next/link";
import * as React from "react";
import { Bookmark, PenLine, Settings2, ShieldCheck, Wallet } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignInButton } from "@/components/auth/sign-in-button";
import { ProfileEditDialog } from "@/components/profile/profile-edit-dialog";
import { PublicProfileSettings } from "@/components/profile/public-profile-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { reportError } from "@/lib/errors";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase";
import { bn, bnMoney } from "@/lib/site";

type Role = "reader" | "reporter" | "moderator" | "admin";

export function AccountDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [signedIn, setSignedIn] = React.useState(false);
  const [name, setName] = React.useState("আপনার নাম");
  const [handle, setHandle] = React.useState("@username");
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<Role>("reader");
  const [completion, setCompletion] = React.useState(0);
  const [balance, setBalance] = React.useState("৳০");
  const [loadError, setLoadError] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      /*
        Demo builds and pull-request previews run without Supabase credentials,
        and supabaseBrowser() throws in that case instead of handing back a dead
        client. This effect finishes in a `finally` with no `catch`, so without
        this guard the throw escapes the effect, reaches the error boundary and
        replaces the page with Next's error document.
      */
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          reportError("account session", authError);
          if (!cancelled) {
            setLoadError("ড্যাশবোর্ডের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন。");
            setSignedIn(false);
            setLoading(false);
          }
          return;
        }
        if (cancelled) return;
        if (!user) {
          setSignedIn(false);
          setLoading(false);
          return;
        }
        setSignedIn(true);
        const [profileResult, roleResult, completionResult, walletResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("username,display_name,avatar_url")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase.rpc("get_my_profile_completion"),
            supabase.rpc("get_my_wallet"),
          ]);
        if (cancelled) return;
        const queryErrors = [
          ["account profile", profileResult.error],
          ["account role", roleResult.error],
          ["account completion", completionResult.error],
          ["account wallet", walletResult.error],
        ] as const;
        for (const [context, error] of queryErrors) {
          if (error) reportError(context, error);
        }
        if (queryErrors.some(([, error]) => error)) {
          setLoadError("ড্যাশবোর্ডের কিছু তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
        }
        const profile = profileResult.data as {
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
        } | null;
        setName(
          profile?.display_name ||
            String(
              user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                "আপনার নাম",
            ),
        );
        setHandle(`@${profile?.username ?? ""}`);
        setAvatar(profile?.avatar_url ?? null);
        setRole((roleResult.data?.role as Role | undefined) ?? "reader");
        setCompletion(Number(completionResult.data ?? 0));
        const wallet = walletResult.data as {
          available?: number;
          held?: number;
          reserved?: number;
        } | null;
        setBalance(
          bnMoney(
            Number(wallet?.available ?? 0) +
              Number(wallet?.held ?? 0) +
              Number(wallet?.reserved ?? 0),
          ),
        );
      } catch (err) {
        reportError("account dashboard", err);
        if (!cancelled) {
          setLoadError("ড্যাশবোর্ডের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
          setSignedIn(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          {loadError && <CardTitle className="text-destructive">{loadError}</CardTitle>}
          <CardTitle>অ্যাকাউন্টে প্রবেশ করুন</CardTitle>
          <CardDescription>
            ড্যাশবোর্ড দেখতে আগে গুগল দিয়ে প্রবেশ করুন।
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInButton />
        </CardContent>
      </Card>
    );
  }

  const actions = [
    {
      href: "/saved",
      icon: Bookmark,
      title: "সংরক্ষিত প্রতিবেদন",
      subtitle: "পরে পড়ার জন্য রাখা খবর দেখুন",
      show: true,
    },
    {
      href: "/account/write",
      icon: PenLine,
      title: role === "reader" ? "রিপোর্টার হিসেবে আবেদন" : "প্রতিবেদন লিখুন",
      subtitle: "নিজের লেখা ও প্রস্তাবনা পাঠান",
      show: true,
    },
    {
      href: "/account/balance",
      icon: Wallet,
      title: "আয় ও উত্তোলন",
      subtitle: "জমা আয় ও উত্তোলনের ইতিহাস",
      show: true,
    },
    {
      href: "/account/moderation",
      icon: ShieldCheck,
      title: "মডারেশন ডেস্ক",
      subtitle: "অপেক্ষমাণ প্রতিবেদন পর্যালোচনা করুন",
      show: role === "moderator" || role === "admin",
    },
    {
      href: "/account/admin",
      icon: Settings2,
      title: "প্রশাসনিক নিয়ন্ত্রণ",
      subtitle: "ব্যবহারকারী ও অর্থপরিশোধ পরিচালনা করুন",
      show: role === "admin",
    },
  ];

  const publicHandle = handle.replace(/^@/, "");

  return (
    <div className="flex flex-col gap-4">
      {loadError && <p className="text-sm text-destructive" role="alert">{loadError}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <p className="text-xs font-medium text-muted-foreground">
              আপনার পরিচয়
            </p>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {avatar && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback>ঢা</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{name}</CardTitle>
                <p className="text-sm text-muted-foreground">{handle}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              প্রোফাইল সম্পাদনা
            </Button>
            {publicHandle ? (
              <Button variant="outline" asChild>
                <Link href={`/u/${encodeURIComponent(publicHandle)}/`}>
                  পাবলিক প্রোফাইল দেখুন
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                পাবলিক প্রোফাইল দেখুন
              </Button>
            )}
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              পাবলিক প্রোফাইল ব্যবস্থাপনা
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-xs font-medium text-muted-foreground">
              মোট জমা আয়
            </p>
            <CardTitle className="text-2xl tabular-nums">{balance}</CardTitle>
            <CardDescription>
              প্রোফাইল সম্পূর্ণ না হওয়া পর্যন্ত জমা আয় আটকে থাকবে।
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="px-0" asChild>
              <Link href="/account/balance">বিস্তারিত দেখুন →</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <p className="text-xs font-medium text-muted-foreground">
              প্রোফাইল সম্পূর্ণ
            </p>
            <CardTitle className="text-2xl tabular-nums">
              {bn(completion)}%
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Progress value={completion} />
            <p className="text-xs text-muted-foreground">
              {completion === 100
                ? "প্রোফাইল সম্পূর্ণ—যোগ্য হলে আয়ের সুবিধা চালু আছে।"
                : "তথ্য পূরণ করলে আপনার লেখার আয়ের সুবিধা চালু হবে।"}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {actions
          .filter((a) => a.show)
          .map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="transition-colors hover:bg-accent">
                <CardContent className="flex items-center gap-3 pt-6">
                  <action.icon className="size-6 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{action.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {action.subtitle}
                    </p>
                  </div>
                  <span aria-hidden>→</span>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
      <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} onSaved={setCompletion} />
      <PublicProfileSettings open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}
