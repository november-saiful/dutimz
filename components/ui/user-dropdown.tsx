"use client";

import * as React from "react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AccountMenuActionId } from "@/lib/account-menu";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";

export type DropdownUser = {
  name: string;
  username: string;
  avatar?: string;
  initials: string;
  status?: string;
};

type MenuItem = {
  icon: string;
  label: string;
  action: AccountMenuActionId;
  /**
   * Needs a session to be useful. A signed-out reader who taps one is signed in
   * first (the header turns the tap into the Google flow) instead of landing on
   * a page they cannot use.
   */
  requiresSession?: boolean;
};

export type UserDropdownProps = {
  /**
   * The signed-in reader, or null/undefined for a visitor with no session. The
   * menu is the same control in both states; only its rows change — Google plus
   * saved content when signed out, dashboard/profile/logout when signed in.
   */
  user?: DropdownUser | null;
  onAction?: (action?: string) => void;
  /** Kept for hosts that still pass them; the reduced menu has no status rows. */
  onStatusChange?: (value: string) => void;
  selectedStatus?: string;
  /**
   * Action ids to hide, for hosts where an item has no destination. A group left
   * with no visible items is dropped along with its separator.
   */
  hiddenActions?: string[];
};

const GUEST_USER: DropdownUser = {
  name: "অতিথি",
  username: "DUTIMZ পাঠক",
  initials: "ঢা",
  status: "offline",
};

/** The one entry a signed-out visitor keeps beyond sign-in. */
const GUEST_ITEMS: MenuItem[] = [
  {
    icon: "solar:bookmark-line-duotone",
    label: "সংরক্ষিত কনটেন্ট",
    action: "saved",
    requiresSession: true,
  },
];

/** The signed-in menu, exactly: dashboard, my profile, log out. */
const ACCOUNT_ITEMS: MenuItem[] = [
  {
    icon: "solar:widget-5-line-duotone",
    label: "ড্যাশবোর্ড",
    action: "dashboard",
  },
  {
    icon: "solar:user-circle-line-duotone",
    label: "আমার প্রোফাইল",
    action: "my-profile",
  },
  {
    icon: "solar:logout-2-bold-duotone",
    label: "লগ আউট",
    action: "logout",
  },
];

export const UserDropdown = ({
  user,
  onAction = () => {},
  hiddenActions = [],
}: UserDropdownProps) => {
  const isGuest = !user;
  const activeUser = user ?? GUEST_USER;
  const hidden = new Set(hiddenActions);
  const visibleItems = (items: MenuItem[]) =>
    items.filter((item) => !hidden.has(item.action));
  const items = visibleItems(isGuest ? GUEST_ITEMS : ACCOUNT_ITEMS);

  const runAction = (item: MenuItem) => {
    // A signed-out reader tapping a session-only row signs in rather than
    // landing on a page that would only bounce them back.
    onAction(isGuest && item.requiresSession ? "sign-in" : item.action);
  };

  const renderMenuItem = (item: MenuItem, index: number) => (
    <DropdownMenuItem
      key={index}
      className={cn("p-2 rounded-lg cursor-pointer")}
      onClick={() => runAction(item)}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Icon icon={item.icon} className="size-5 text-muted-foreground" />
        {item.label}
      </span>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer size-10 border border-border">
          {activeUser.avatar ? (
            <AvatarImage src={activeUser.avatar} alt={activeUser.name} />
          ) : null}
          <AvatarFallback>{activeUser.initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[300px] rounded-2xl bg-popover p-0 text-popover-foreground"
        align="end"
        collisionPadding={8}
      >
        <div className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain">
          <section className="rounded-2xl border border-border bg-card p-1 shadow-sm">
            <div className="flex items-center p-2">
              <div className="flex-1 flex items-center gap-2">
                <Avatar className="cursor-pointer size-10 border border-border">
                  {activeUser.avatar ? (
                    <AvatarImage src={activeUser.avatar} alt={activeUser.name} />
                  ) : null}
                  <AvatarFallback>{activeUser.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-sm text-foreground">
                    {activeUser.name}
                  </h3>
                  <p className="truncate text-muted-foreground text-xs">
                    {activeUser.username}
                  </p>
                </div>
              </div>
            </div>

            {/* Signed out, the menu leads with the one way in: Google. */}
            {isGuest && (
              <div className="px-1 pb-2">
                <SignInButton />
              </div>
            )}

            {items.length > 0 && (
              <>
                {isGuest && <DropdownMenuSeparator />}
                {items.map(renderMenuItem)}
              </>
            )}
          </section>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;
