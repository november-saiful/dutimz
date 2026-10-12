"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";

export function LiveAlertToggle() {
  const [enabled, setEnabled] = React.useState(false);

  return (
    <div className="flex items-center justify-between rounded-[20px] border border-border/80 bg-card/60 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          {enabled ? <Bell className="size-4" /> : <BellOff className="size-4 text-muted-foreground" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">
            লাইভ আপডেটের নোটিফিকেশন পান
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            এই প্রতিবেদন সংক্রান্ত পরবর্তী তথ্যের তাৎক্ষণিক বিজ্ঞপ্তি
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="লাইভ আপডেট নোটিফিকেশন টগল"
        onClick={() => setEnabled((prev) => !prev)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          enabled ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
