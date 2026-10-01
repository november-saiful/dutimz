"use client";

import * as React from "react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  status: string;
};

type MenuItem = {
  icon: string;
  label: string;
  /** An id from `lib/account-menu`; both the menu and the header read that table. */
  action?: AccountMenuActionId;
  iconClass?: string;
  rightIcon?: string;
  /**
   * Needs a session to be useful. A signed-out reader who taps one is signed in
   * first (the header turns the tap into the Google flow) instead of landing on
   * a page they cannot use.
   */
  requiresSession?: boolean;
};

type StatusOption = {
  value: string;
  icon: string;
  label: string;
};

export type UserDropdownProps = {
  /**
   * The signed-in reader, or null/undefined for a visitor with no session. The
   * menu is the same in both states — the sign-in button and the session-only
   * entries are the only rows that change — so the account menu never looks
   * like a different control depending on who opened it.
   */
  user?: DropdownUser | null;
  onAction?: (action?: string) => void;
  onStatusChange?: (value: string) => void;
  selectedStatus?: string;
  /**
   * Action ids to hide, for hosts where an item has no destination. The status
   * submenu is hidden with `"status"`; a group left with no visible items is
   * dropped along with its separator, so the menu never shows dead entries.
   */
  hiddenActions?: string[];
};

const GUEST_USER: DropdownUser = {
  name: "অতিথি",
  username: "DUTIMZ পাঠক",
  initials: "ঢা",
  status: "offline",
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: "focus", icon: "solar:emoji-funny-circle-line-duotone", label: "Focus" },
  { value: "offline", icon: "solar:moon-sleep-line-duotone", label: "Appear Offline" },
];

/** Reader tools that need an account; signed-out taps become a Google sign-in. */
const PROFILE_ITEMS: MenuItem[] = [
  { icon: "solar:user-circle-line-duotone", label: "Your profile", action: "profile", requiresSession: true },
  { icon: "solar:settings-line-duotone", label: "Settings", action: "settings", requiresSession: true },
  { icon: "solar:bell-line-duotone", label: "Notifications", action: "notifications", requiresSession: true },
  {
    icon: "solar:question-circle-line-duotone",
    label: "Get help?",
    action: "help",
    rightIcon: "solar:square-top-down-line-duotone",
  },
];

/** Reader tools that work without a session. */
const READER_ITEMS: MenuItem[] = [
  { icon: "solar:bookmark-line-duotone", label: "সংরক্ষিত প্রতিবেদন", action: "saved" },
  { icon: "solar:chart-2-line-duotone", label: "কার্যক্রমের পরিসংখ্যান", action: "statistics" },
];

/** Pages that explain the newsroom. */
const NEWSROOM_ITEMS: MenuItem[] = [
  { icon: "solar:scale-line-duotone", label: "সংশোধন ও তথ্য যাচাই", action: "corrections" },
  { icon: "solar:document-text-line-duotone", label: "সম্পাদকীয় নীতিমালা", action: "guidelines" },
  { icon: "solar:info-circle-line-duotone", label: "আমাদের পরিচয়", action: "about" },
];

/** Session-only entries, rendered only while signed in. */
const ACCOUNT_ITEMS: MenuItem[] = [
  {
    icon: "solar:users-group-rounded-bold-duotone",
    label: "Switch account",
    action: "switch",
  },
  { icon: "solar:logout-2-bold-duotone", label: "Log out", action: "logout" },
];

export const UserDropdown = ({
  user,
  onAction = () => {},
  onStatusChange = () => {},
  selectedStatus = "online",
  hiddenActions = [],
}: UserDropdownProps) => {
  const isGuest = !user;
  const activeUser = user ?? GUEST_USER;
  const hidden = new Set(hiddenActions);
  const visibleItems = (items: MenuItem[]) =>
    items.filter((item) => !item.action || !hidden.has(item.action));
  const showStatus = !isGuest && !hidden.has("status");
  const groups = [
    visibleItems(PROFILE_ITEMS),
    visibleItems(READER_ITEMS),
    visibleItems(NEWSROOM_ITEMS),
  ].filter((items) => items.length > 0);
  const accountItems = visibleItems(ACCOUNT_ITEMS);

  const runAction = (item: MenuItem) => {
    // A signed-out reader tapping a session-only row signs in rather than
    // landing on a page that would only bounce them back.
    onAction(isGuest && item.requiresSession ? "sign-in" : item.action);
  };

  const renderMenuItem = (item: MenuItem, index: number) => (
    <DropdownMenuItem
      key={index}
      className={cn(
        item.rightIcon ? "justify-between" : "",
        "p-2 rounded-lg cursor-pointer",
      )}
      onClick={() => runAction(item)}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Icon
          icon={item.icon}
          className={cn("size-5", item.iconClass || "text-muted-foreground")}
        />
        {item.label}
      </span>
      {item.rightIcon && (
        <Icon icon={item.rightIcon} className="size-4 text-muted-foreground" />
      )}
    </DropdownMenuItem>
  );

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      online: "text-primary bg-primary/10 border-primary/30",
      offline: "text-muted-foreground bg-muted border-border",
      busy: "text-destructive bg-destructive/10 border-destructive/30",
    };
    return colors[status.toLowerCase()] || colors.online;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer size-10 border border-border">
          {activeUser.avatar ? <AvatarImage src={activeUser.avatar} alt={activeUser.name} /> : null}
          <AvatarFallback>{activeUser.initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[310px] rounded-2xl bg-popover p-0 text-popover-foreground"
        align="end"
        /*
          Keep a small gap from the viewport edge. Radix hands the scroller the
          room between the trigger and that boundary, so the content's 1px border
          still lands inside the screen instead of hanging 2px past it.
        */
        collisionPadding={8}
      >
        {/*
          The wrapper — not the content — is the scroller. The content clips its
          children to its rounded corners, while this div takes the height Radix
          measured between the trigger and the screen edge, so a menu taller than
          a genuinely short viewport scrolls internally instead of hanging off
          the bottom of the screen.
        */}
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
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{activeUser.name}</h3>
                  <p className="text-muted-foreground text-xs">{activeUser.username}</p>
                </div>
              </div>
              {!isGuest && (
                <Badge
                  className={`${getStatusColor(activeUser.status)} border-[0.5px] text-[11px] rounded-sm capitalize`}
                >
                  {activeUser.status}
                </Badge>
              )}
            </div>

            {/* The one thing a signed-out menu adds: Google sign-in, in place. */}
            {isGuest && (
              <div className="px-1 pb-2">
                <SignInButton />
              </div>
            )}

            {showStatus && (
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer p-2 rounded-lg">
                    <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Icon
                        icon="solar:smile-circle-line-duotone"
                        className="size-5 text-muted-foreground"
                      />
                      Update status
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="bg-popover">
                      <DropdownMenuRadioGroup value={selectedStatus} onValueChange={onStatusChange}>
                        {STATUS_OPTIONS.map((status, index) => (
                          <DropdownMenuRadioItem className="gap-2" key={index} value={status.value}>
                            <Icon icon={status.icon} className="size-5 text-muted-foreground" />
                            {status.label}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </DropdownMenuGroup>
            )}

            {/*
              The menu deliberately carries no section list. Every section already
              lives in the sidebar's সংবাদ বিভাগ tree, and repeating it here made the
              dropdown taller than a phone viewport.
            */}
            {groups.map((items, index) => (
              <React.Fragment key={index}>
                {(showStatus || index > 0) && <DropdownMenuSeparator />}
                <DropdownMenuGroup>{items.map(renderMenuItem)}</DropdownMenuGroup>
              </React.Fragment>
            ))}
          </section>

          {!isGuest && accountItems.length > 0 && (
            <section className="mt-1 p-1 rounded-2xl">
              <DropdownMenuGroup>{accountItems.map(renderMenuItem)}</DropdownMenuGroup>
            </section>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;
