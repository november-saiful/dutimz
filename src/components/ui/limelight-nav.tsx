"use client";

import React, {
  useState,
  useRef,
  useLayoutEffect,
  cloneElement,
  type ReactElement,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// --- Internal Types and Defaults ---

export interface NavItem {
  id: string | number;
  icon: ReactElement;
  label?: string;
  /** Route to navigate to; renders the item as a Next.js Link. */
  href?: string;
  /** Direct click handler (used instead of / alongside href). */
  onClick?: () => void;
}

const DefaultHomeIcon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
const DefaultCompassIcon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" /></svg>;
const DefaultBellIcon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

const defaultNavItems: NavItem[] = [
  { id: "default-home", icon: <DefaultHomeIcon />, label: "Home" },
  { id: "default-explore", icon: <DefaultCompassIcon />, label: "Explore" },
  { id: "default-notifications", icon: <DefaultBellIcon />, label: "Notifications" },
];

export interface LimelightNavProps {
  items?: NavItem[];
  /** Controlled active index; omit for uncontrolled (internal state). */
  defaultActiveIndex?: number;
  onTabChange?: (index: number) => void;
  className?: string;
  limelightClassName?: string;
  iconContainerClassName?: string;
  iconClassName?: string;
}

/**
 * An adaptive-width navigation bar with a "limelight" effect that highlights
 * the active item. Adapted for DUTIMZ: Material 3 CSS variables instead of
 * shadcn `bg-card`/`text-foreground` tokens, glass surface, and Next.js
 * <Link> routing (with active-state detection via usePathname).
 */
export function LimelightNav({
  items = defaultNavItems,
  defaultActiveIndex = 0,
  onTabChange,
  className,
  limelightClassName,
  iconContainerClassName,
  iconClassName,
}: LimelightNavProps) {
  const pathname = usePathname();
  const [activeIndex, setActiveIndex] = useState(defaultActiveIndex);
  const [isReady, setIsReady] = useState(false);
  const navItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const limelightRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (items.length === 0) return;

    const limelight = limelightRef.current;
    const activeItem = navItemRefs.current[activeIndex];

    if (limelight && activeItem) {
      const newLeft =
        activeItem.offsetLeft + activeItem.offsetWidth / 2 - limelight.offsetWidth / 2;
      limelight.style.left = `${newLeft}px`;

      if (!isReady) {
        setTimeout(() => setIsReady(true), 50);
      }
    }
  }, [activeIndex, isReady, items]);

  if (items.length === 0) {
    return null;
  }

  const handleItemClick = (index: number, itemOnClick?: () => void) => {
    setActiveIndex(index);
    onTabChange?.(index);
    itemOnClick?.();
  };

  return (
    <nav
      className={`relative inline-flex items-center h-16 rounded-2xl border px-2 ${className ?? ""}`}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderColor: "var(--glass-border)",
        color: "var(--md-sys-color-on-surface)",
        boxShadow:
          "0 8px 24px -8px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
      }}
    >
      {items.map(({ id, icon, label, href, onClick }, index) => {
        const isActive = href
          ? pathname === href || pathname.startsWith(`${href}/`)
          : activeIndex === index;
        const inner = (
          <>
            {cloneElement(icon, {
              className: `w-6 h-6 transition-opacity duration-100 ease-in-out ${
                isActive ? "opacity-100" : "opacity-40"
              } ${icon.props.className || ""} ${iconClassName || ""}`,
            })}
          </>
        );

        return href ? (
          <Link
            key={id}
            href={href}
            ref={(el) => {
              navItemRefs.current[index] = el;
            }}
            className={`relative z-20 flex h-full cursor-pointer items-center justify-center p-5 ${iconContainerClassName ?? ""}`}
            onClick={() => handleItemClick(index, onClick)}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
          >
            {inner}
          </Link>
        ) : (
          <a
            key={id}
            ref={(el) => {
              navItemRefs.current[index] = el;
            }}
            className={`relative z-20 flex h-full cursor-pointer items-center justify-center p-5 ${iconContainerClassName ?? ""}`}
            onClick={() => handleItemClick(index, onClick)}
            aria-label={label}
            role={onClick ? "button" : undefined}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleItemClick(index, onClick);
              }
            }}
          >
            {inner}
          </a>
        );
      })}

      <div
        ref={limelightRef}
        className={`absolute top-0 z-10 w-11 h-[5px] rounded-full ${limelightClassName ?? ""}`}
        style={{
          left: "-999px",
          background: "var(--md-sys-color-primary)",
          boxShadow: "0 50px 15px var(--md-sys-color-primary)",
        }}
      >
        <div className="absolute left-[-30%] top-[5px] w-[160%] h-14 [clip-path:polygon(5%_100%,25%_0,75%_0,95%_100%)] pointer-events-none" style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--md-sys-color-primary) 30%, transparent), transparent)" }} />
      </div>
    </nav>
  );
}
