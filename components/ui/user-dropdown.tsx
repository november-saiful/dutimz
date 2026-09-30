"use client";

import * as React from "react";

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
import { cn } from "@/lib/utils";
import { categoryAction, type AccountMenuActionId } from "@/lib/account-menu";
import { CATEGORIES } from "@/lib/site";
import { Icon } from "@iconify/react";

export type DropdownUser = {
  name: string;
  username: string;
  avatar?: string;
  initials: string;
  status: string;
};

type MenuBadge = {
  text: string;
  className?: string;
};

type MenuItem = {
  icon: string;
  label: string;
  /** An id from `lib/account-menu`; both the menu and the header read that table. */
  action?: AccountMenuActionId;
  iconClass?: string;
  badge?: MenuBadge;
  rightIcon?: string;
  showAvatar?: boolean;
  /** Renders the row as a primary call to action (used for "Sign in"). */
  emphasis?: boolean;
};

type StatusOption = {
  value: string;
  icon: string;
  label: string;
};

export type UserDropdownProps = {
  /**
   * The signed-in reader, or null/undefined for a visitor with no session. The
   * menu still opens when signed out: it shows a sign-in call to action instead
   * of the profile/session entries, so the account menu is never a dead end.
   */
  user?: DropdownUser | null;
  onAction?: (action?: string) => void;
  onStatusChange?: (value: string) => void;
  selectedStatus?: string;
  promoDiscount?: string;
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

const MENU_ITEMS: {
  status: StatusOption[];
  profile: MenuItem[];
  premium: MenuItem[];
  support: MenuItem[];
  account: MenuItem[];
  guest: MenuItem[];
  guestExplore: MenuItem[];
  guestInfo: MenuItem[];
} = {
  status: [
    { value: "focus", icon: "solar:emoji-funny-circle-line-duotone", label: "Focus" },
    { value: "offline", icon: "solar:moon-sleep-line-duotone", label: "Appear Offline" },
  ],
  profile: [
    { icon: "solar:user-circle-line-duotone", label: "Your profile", action: "profile" },
    { icon: "solar:sun-line-duotone", label: "Appearance", action: "appearance" },
    { icon: "solar:settings-line-duotone", label: "Settings", action: "settings" },
    { icon: "solar:bell-line-duotone", label: "Notifications", action: "notifications" },
  ],
  premium: [
    {
      icon: "solar:star-bold",
      label: "Upgrade to Pro",
      action: "upgrade",
      iconClass: "text-primary",
      badge: { text: "20% off", className: "bg-primary text-primary-foreground text-[11px]" },
    },
    { icon: "solar:gift-line-duotone", label: "Referrals", action: "referrals" },
  ],
  support: [
    { icon: "solar:download-line-duotone", label: "Download app", action: "download" },
    {
      icon: "solar:letter-unread-line-duotone",
      label: "What's new?",
      action: "whats-new",
      rightIcon: "solar:square-top-down-line-duotone",
    },
    {
      icon: "solar:question-circle-line-duotone",
      label: "Get help?",
      action: "help",
      rightIcon: "solar:square-top-down-line-duotone",
    },
  ],
  account: [
    {
      icon: "solar:users-group-rounded-bold-duotone",
      label: "Switch account",
      action: "switch",
      showAvatar: false,
    },
    { icon: "solar:logout-2-bold-duotone", label: "Log out", action: "logout" },
  ],
  /*
    A visitor with no session still gets real destinations: the reader tools
    that need no account, the section index, and the pages that explain the
    newsroom. Every action maps to a route in the header's handler.
  */
  guest: [
    {
      icon: "solar:login-3-bold-duotone",
      label: "প্রবেশ করুন",
      action: "sign-in",
      emphasis: true,
    },
  ],
  guestExplore: [
    { icon: "solar:bookmark-line-duotone", label: "সংরক্ষিত প্রতিবেদন", action: "saved" },
    { icon: "solar:chart-2-line-duotone", label: "কার্যক্রমের পরিসংখ্যান", action: "statistics" },
  ],
  guestInfo: [
    { icon: "solar:scale-line-duotone", label: "সংশোধন ও তথ্য যাচাই", action: "corrections" },
    { icon: "solar:document-text-line-duotone", label: "সম্পাদকীয় নীতিমালা", action: "guidelines" },
    { icon: "solar:info-circle-line-duotone", label: "আমাদের পরিচয়", action: "about" },
  ],
};

export const UserDropdown = ({
  user,
  onAction = () => {},
  onStatusChange = () => {},
  selectedStatus = "online",
  promoDiscount = "20% off",
  hiddenActions = [],
}: UserDropdownProps) => {
  const isGuest = !user;
  const activeUser = user ?? GUEST_USER;
  const hidden = new Set(hiddenActions);
  const visibleItems = (items: MenuItem[]) =>
    items.filter((item) => !item.action || !hidden.has(item.action));
  const showStatus = !isGuest && !hidden.has("status");
  const groups = [
    visibleItems(MENU_ITEMS.profile),
    visibleItems(MENU_ITEMS.premium),
    visibleItems(MENU_ITEMS.support),
  ].filter((items) => items.length > 0);
  const guestItems = visibleItems(MENU_ITEMS.guest);
  const guestExplore = visibleItems(MENU_ITEMS.guestExplore);
  const guestInfo = visibleItems(MENU_ITEMS.guestInfo);
  const showCategories = !hidden.has("categories");
  const categories = CATEGORIES.filter((category) => category.slug !== "all");
  const accountItems = visibleItems(MENU_ITEMS.account);

  const renderMenuItem = (item: MenuItem, index: number) => (
    <DropdownMenuItem
      key={index}
      className={cn(
        item.badge || item.showAvatar || item.rightIcon ? "justify-between" : "",
        "p-2 rounded-lg cursor-pointer",
        item.emphasis &&
          "bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground",
      )}
      onClick={() => onAction(item.action)}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Icon
          icon={item.icon}
          className={cn(
            "size-5",
            item.emphasis ? "text-primary-foreground" : item.iconClass || "text-muted-foreground",
          )}
        />
        {item.label}
      </span>
      {item.badge && (
        <Badge className={item.badge.className}>{promoDiscount || item.badge.text}</Badge>
      )}
      {item.rightIcon && (
        <Icon icon={item.rightIcon} className="size-4 text-muted-foreground" />
      )}
      {item.showAvatar && (
        <Avatar className="cursor-pointer size-6 shadow-sm border border-border">
          {activeUser.avatar ? <AvatarImage src={activeUser.avatar} alt={activeUser.name} /> : null}
          <AvatarFallback>{activeUser.initials}</AvatarFallback>
        </Avatar>
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
        className="no-scrollbar w-[310px] rounded-2xl bg-popover p-0 text-popover-foreground"
        align="end"
      >
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

          {isGuest ? (
            <>
              <DropdownMenuGroup>{guestItems.map(renderMenuItem)}</DropdownMenuGroup>
              {(guestExplore.length > 0 || showCategories) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {guestExplore.map(renderMenuItem)}
                    {showCategories && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer p-2 rounded-lg">
                          <span className="flex items-center gap-1.5 font-medium">
                            <Icon
                              icon="solar:layers-minimalistic-bold-duotone"
                              className="size-5 text-muted-foreground"
                            />
                            সংবাদ বিভাগ
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="bg-popover">
                            {categories.map((category) => (
                              <DropdownMenuItem
                                key={category.slug}
                                className="p-2 rounded-lg cursor-pointer"
                                onClick={() => onAction(categoryAction(category.slug))}
                              >
                                {category.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    )}
                  </DropdownMenuGroup>
                </>
              )}
              {guestInfo.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>{guestInfo.map(renderMenuItem)}</DropdownMenuGroup>
                </>
              )}
            </>
          ) : (
            <>
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
                          {MENU_ITEMS.status.map((status, index) => (
                            <DropdownMenuRadioItem className="gap-2" key={index} value={status.value}>
                              <Icon
                                icon={status.icon}
                                className="size-5 text-muted-foreground"
                              />
                              {status.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
              )}

              {groups.map((items, index) => (
                <React.Fragment key={index}>
                  {(showStatus || index > 0) && <DropdownMenuSeparator />}
                  <DropdownMenuGroup>{items.map(renderMenuItem)}</DropdownMenuGroup>
                </React.Fragment>
              ))}
            </>
          )}
        </section>

        {!isGuest && accountItems.length > 0 && (
          <section className="mt-1 p-1 rounded-2xl">
            <DropdownMenuGroup>{accountItems.map(renderMenuItem)}</DropdownMenuGroup>
          </section>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;
