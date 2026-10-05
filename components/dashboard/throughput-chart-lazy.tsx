"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * recharts is the heaviest dependency on the landing page, and the chart sits well below the fold.
 * A server component cannot use `next/dynamic` with `ssr: false`, so this small client boundary
 * handles the load: the chart's code is fetched only when the page reaches the browser, and the
 * reserved-height skeleton keeps the layout from shifting while it arrives.
 */
const ThroughputChart = dynamic(
  () => import("@/components/dashboard/throughput-chart").then((mod) => mod.ThroughputChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export function LazyThroughputChart({
  data,
}: {
  data: { week: string; opened: number; completed: number }[];
}) {
  return <ThroughputChart data={data} />;
}
