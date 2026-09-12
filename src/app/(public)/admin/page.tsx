export const runtime = "edge";

import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";

export const metadata: Metadata = {
  title: "Admin — Analytics",
  robots: { index: false },
};

export default function AdminPage() {
  return (
    <div className="container mt-10 max-w-5xl">
      <AnalyticsDashboard />
    </div>
  );
}
