import type { Metadata } from "next";

import { TreeDemo } from "@/app/demo/tree-view/tree-demo";

export const metadata: Metadata = {
  title: "Tree view demo",
  robots: { index: false, follow: false },
};

export default function TreeViewDemoPage() {
  return (
    <div className="flex min-h-[60vh] w-full items-start justify-center p-6">
      <TreeDemo />
    </div>
  );
}
