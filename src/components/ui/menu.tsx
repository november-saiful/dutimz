"use client";

import React from "react";
import { Menu } from "antd";
import type { MenuProps } from "antd";

// Re-export antd's types for app-level builders.
export type MenuItem = Required<MenuProps>["items"][number];
export type { MenuProps };

export interface DUTIMZMenuProps extends MenuProps {
  /** Locale for built-in theming/hooks; the wrapper is otherwise pass-through. */
  locale?: "bn" | "en";
}

/**
 * Themed antd Menu for DUTIMZ — pass-through wrapper that bakes in the
 * Material 3 palette via ConfigProvider theme (callers can still override).
 * Use `mode="inline"` inside drawers/sidebars; `mode="horizontal"` for bars.
 */
export function DUTIMZMenu({ locale = "bn", style, ...rest }: DUTIMZMenuProps) {
  void locale; // reserved for future locale-specific menu behavior
  return (
    <Menu
      style={{ borderInlineEnd: "none", background: "transparent", ...style }}
      {...rest}
    />
  );
}
