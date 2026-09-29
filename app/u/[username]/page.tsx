import type { Metadata } from "next";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { PublicProfile } from "@/components/profile/public-profile";
import { Card, CardContent } from "@/components/ui/card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: "DUTIMZ সদস্যের প্রকাশ্য পরিচয় ও প্রকাশিত প্রতিবেদন।",
    alternates: { canonical: `/u/${username}/` },
  };
}

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const decoded = (() => {
    try {
      return decodeURIComponent(username);
    } catch {
      return username;
    }
  })();
  return (
    <DutimzShell
      title={`@${decoded}`}
      crumbs={[{ label: "সদস্য" }, { label: `@${decoded}` }]}
    >
      <Card>
        <CardContent className="pt-6">
          <PublicProfile username={decoded} />
        </CardContent>
      </Card>
    </DutimzShell>
  );
}
