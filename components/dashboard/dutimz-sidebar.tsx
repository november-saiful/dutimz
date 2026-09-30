"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  FileText,
  Home,
  Info,
  PenLine,
  Scale,
  Search,
  UserRound,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CATEGORIES } from "@/lib/site";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DutimzSidebar() {
  const pathname = usePathname() ?? "/";

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        {/*
          The wordmark moved to the centre of the top bar, so the rail keeps
          only the icon — and only while it is collapsed, where the icon is the
          one thing that still says which site this is.
        */}
        <Link
          href="/"
          aria-label="DUTIMZ মূলপাতা"
          className="hidden items-center justify-center rounded-md p-1 group-data-[collapsible=icon]:flex"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-icon.svg"
            alt=""
            aria-hidden
            width={32}
            height={32}
            className="h-8 w-8"
          />
        </Link>
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          ঢাকা বিশ্ববিদ্যালয়ের সংবাদমাধ্যম
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>প্রধান</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/")}
                  tooltip="সব খবর"
                >
                  <Link href="/">
                    <Home />
                    <span>সব খবর</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/search")}
                  tooltip="খুঁজুন"
                >
                  <Link href="/search">
                    <Search />
                    <span>খুঁজুন</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/statistics")}
                  tooltip="পরিসংখ্যান"
                >
                  <Link href="/statistics">
                    <BarChart3 />
                    <span>পরিসংখ্যান</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/saved")}
                  tooltip="সংরক্ষিত"
                >
                  <Link href="/saved">
                    <Bookmark />
                    <span>সংরক্ষিত</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>সংবাদ বিভাগ</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {CATEGORIES.filter((c) => c.slug !== "all").map((category) => {
                const href = `/category/${category.slug}`;
                return (
                  <SidebarMenuItem key={category.slug}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(pathname, href)}
                      tooltip={category.label}
                    >
                      <Link href={href}>
                        <FileText />
                        <span>{category.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>পাঠক</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/account")}
                  tooltip="আমার ড্যাশবোর্ড"
                >
                  <Link href="/account">
                    <UserRound />
                    <span>আমার ড্যাশবোর্ড</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/account/write")}
                  tooltip="প্রতিবেদন লিখুন"
                >
                  <Link href="/account/write">
                    <PenLine />
                    <span>প্রতিবেদন লিখুন</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(pathname, "/corrections")}
                  tooltip="সংশোধন"
                >
                  <Link href="/corrections">
                    <Scale />
                    <span>সংশোধন</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive(pathname, "/about")}
              tooltip="আমাদের পরিচয়"
            >
              <Link href="/about">
                <Info />
                <span>আমাদের পরিচয়</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive(pathname, "/guidelines")}
              tooltip="নীতিমালা"
            >
              <Link href="/guidelines">
                <Users />
                <span>নীতিমালা</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="px-2 pb-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          © {new Date().getFullYear()} DUTIMZ
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
