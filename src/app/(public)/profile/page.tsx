import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/server";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { RoleBadge } from "@/components/auth/RoleBadge";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { formatDate } from "@/lib/utils/format";
import { AUTH } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false },
};

const ROLE_LABELS: Record<string, { bn: string; en: string }> = {
  visitor: { bn: "পাঠক", en: "Reader" },
  reporter: { bn: "প্রতিবেদক", en: "Reporter" },
  moderator: { bn: "মডারেটর", en: "Moderator" },
  admin: { bn: "অ্যাডমিন", en: "Admin" },
};

export default async function ProfilePage() {
  const { user, profile } = await getAuthContext();

  // Defense in depth: middleware already guards /profile, but if the session
  // is missing (or Supabase is unconfigured) send the user to login.
  if (!user || !profile) {
    redirect(AUTH.loginPath);
  }

  const label = ROLE_LABELS[profile.role] ?? { bn: profile.role, en: profile.role };

  return (
    <div className="container mt-12 max-w-2xl">
      <div className="glass-card p-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
          {/* Avatar falls back to Google's CDN; next/image would need another
              remote pattern, so a plain img with rounded styling is used. */}
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              width={72}
              height={72}
              referrerPolicy="no-referrer"
              className="h-18 w-18 rounded-full border border-white/40 object-cover"
            />
          ) : (
            <div
              className="flex h-18 w-18 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{ background: "var(--md-sys-color-primary)" }}
              aria-hidden="true"
            >
              {(profile.display_name ?? profile.username ?? "?").charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">
              {profile.display_name ?? profile.username}
            </h1>
            <p className="truncate text-sm opacity-70" dir="ltr">
              {profile.email}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
              <RoleBadge role={profile.role} labelBn={label.bn} labelEn={label.en} />
              {profile.is_verified && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{
                    background: "var(--md-sys-color-primary-container)",
                    color: "var(--md-sys-color-on-primary-container)",
                  }}
                >
                  ✓ Verified
                </span>
              )}
            </div>
          </div>

          <div className="sm:ms-auto">
            <SignOutButton />
          </div>
        </div>

        <hr className="my-8 border-white/30" />

        <ProfileForm profile={profile} />

        <p className="mt-6 text-xs opacity-50">
          সদস্য হয়েছেন / Member since {formatDate(profile.created_at, "bn")} ·{" "}
          {formatDate(profile.created_at, "en")}
        </p>
      </div>
    </div>
  );
}
