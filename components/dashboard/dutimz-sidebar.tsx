"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  FileText,
  Home,
  Info,
  Scale,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar";
import { TreeItem, TreeSection, TreeView } from "@/components/ui/animated-file-tree";
import { CATEGORIES } from "@/lib/site";

type NavEntry = { id: string; label: string; href: string; icon: LucideIcon };

const PRIMARY: NavEntry[] = [
  { id: "all", label: "সব খবর", href: "/", icon: Home },
  { id: "flipps", label: "ফ্লিপস", href: "/flipps", icon: Clapperboard },
  { id: "search", label: "খুঁজুন", href: "/search", icon: Search },
];

const CATEGORY_ENTRIES: NavEntry[] = CATEGORIES.filter(
  (category) => category.slug !== "all",
).map((category) => ({
  id: `category:${category.slug}`,
  label: category.label,
  href: `/category/${category.slug}`,
  icon: FileText,
}));

const ABOUT: NavEntry[] = [
  { id: "about", label: "আমাদের পরিচয়", href: "/about", icon: Info },
  { id: "guidelines", label: "নীতিমালা", href: "/guidelines", icon: Users },
  { id: "corrections", label: "সংশোধন", href: "/corrections", icon: Scale },
];

const ALL_ENTRIES = [...PRIMARY, ...CATEGORY_ENTRIES, ...ABOUT];

const HREF_BY_ID = new Map(ALL_ENTRIES.map((entry) => [entry.id, entry.href]));

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The selected row is the most specific route that matches the path. */
function activeIdFor(pathname: string): string | undefined {
  return ALL_ENTRIES.filter((entry) => isActive(pathname, entry.href))
    .sort((a, b) => b.href.length - a.href.length)
    .at(0)?.id;
}

export function DutimzSidebar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  // Following a link closes the mobile drawer; the desktop rail never moves.
  React.useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  const selectedId = activeIdFor(pathname);

  const renderEntry = (entry: NavEntry) => (
    <TreeItem key={entry.id} id={entry.id} label={entry.label} icon={entry.icon} />
  );

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarContent>
        <TreeView
          className="pt-3"
          selectedId={selectedId}
          onSelect={(id) => {
            const href = HREF_BY_ID.get(id);
            if (href) router.push(href);
          }}
        >
          <TreeSection title="প্রধান">{PRIMARY.map(renderEntry)}</TreeSection>
          <TreeSection title="সংবাদ বিভাগ">{CATEGORY_ENTRIES.map(renderEntry)}</TreeSection>
          <TreeSection title="আমাদের পরিচয়">{ABOUT.map(renderEntry)}</TreeSection>
        </TreeView>
      </SidebarContent>
    </Sidebar>
  );
}
