"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  acknowledgeDuEmailPolicy,
  duEmailPolicyAcknowledged,
} from "@/lib/auth-client";

/**
 * Every door into the site is the Google button, so the one warning that can reach a
 * reader *before* they hand their email to Google is this dialog: the first sign-in
 * attempt of a browser session is held here until the reader confirms they know only
 * Dhaka-University addresses (anything ending in du.ac.bd, departmental subdomains
 * included) can open an account. GoTrue's own refusal arrives only after the fact.
 */
export function useDuEmailPolicy() {
  const [open, setOpen] = React.useState(false);
  const pending = React.useRef<null | (() => void)>(null);

  function confirm() {
    acknowledgeDuEmailPolicy();
    setOpen(false);
    const action = pending.current;
    pending.current = null;
    action?.();
  }

  function gated(action: () => void) {
    if (duEmailPolicyAcknowledged()) {
      action();
      return;
    }
    pending.current = action;
    setOpen(true);
  }

  function dismiss() {
    pending.current = null;
    setOpen(false);
  }

  const policyDialog = (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      {/*
        The warning opens from inside the menu, so it must clear every layer the
        site stacks above a dialog's own z-50: the top bar (60), the open menu
        (70) and the phone search sheet (80). At 120 the card and its scrim sit
        over all of them instead of behind the drawer they were opened from.
      */}
      <DialogContent
        overlayClassName="z-[120]"
        className="z-[120] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>শুধু ঢাবির ইমেইল দিয়ে প্রবেশ</DialogTitle>
          <DialogDescription className="leading-relaxed">
            এই সাইটে অ্যাকাউন্ট খোলা যায় শুধু ঢাকা বিশ্ববিদ্যালয়ের দেওয়া
            ইমেইল দিয়ে — যে ঠিকানা <b>du.ac.bd</b> দিয়ে শেষ হয় (যেমন{" "}
            <b>username@du.ac.bd</b> বা <b>username@mgt.du.ac.bd</b>)। Gmail বা
            অন্য কোনো ইমেইল দিয়ে অ্যাকাউন্ট খোলা যাবে না।
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>
            বাতিল
          </Button>
          <Button onClick={confirm}>বুঝেছি, গুগল দিয়ে প্রবেশ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { policyDialog, gated };
}
