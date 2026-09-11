"use client";

import { create } from "zustand";

export interface Toast {
  id: string;
  message: string;
  tone: "success" | "error" | "info";
}

interface UIStore {
  isSearchOpen: boolean;
  isMobileMenuOpen: boolean;
  toastQueue: Toast[];
  openSearch: () => void;
  closeSearch: () => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSearchOpen: false,
  isMobileMenuOpen: false,
  toastQueue: [],
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleMobileMenu: () =>
    set((state) => ({ isMobileMenuOpen: !state.isMobileMenuOpen })),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),
  addToast: (toast) =>
    set((state) => ({
      toastQueue: [
        ...state.toastQueue,
        { ...toast, id: crypto.randomUUID() },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toastQueue: state.toastQueue.filter((t) => t.id !== id),
    })),
}));
