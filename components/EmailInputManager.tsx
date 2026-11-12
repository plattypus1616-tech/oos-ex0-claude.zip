"use client";

import React, { useState } from "react";
import { Sparkles, Search, Check, Mail } from "lucide-react";

interface EmailInputManagerProps {
  storeUrl: string;
  currentEmail: string;
  onUpdateEmail: (email: string) => void;
  className?: string;
  onFocus?: () => void;
}

export default function EmailInputManager({
  storeUrl,
  currentEmail,
  onUpdateEmail,
  className = "",
  onFocus,
}: EmailInputManagerProps) {
  const [isFetching, setIsFetching] = useState(false);
  const [appliedBadge, setAppliedBadge] = useState<string | null>(null);

  // Strategy 1: Lightweight Heuristic (Attempts guessing standard B2B email)
  const guessEmailHeuristic = () => {
    try {
      const url = storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`;
      const domain = new URL(url).hostname.replace("www.", "");
      return `hello@${domain}`; // 40% of Shopify stores use this pattern
    } catch {
      return "";
    }
  };

  // Strategy 2: OSINT Bypass (Opens targeted Google Search)
  const handleGoogleSearch = () => {
    try {
      const url = storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`;
      const domain = new URL(url).hostname.replace("www.", "");
      // Use Google search dorking to expose public email
      const query = `site:${domain} "@${domain}" OR "contact us" OR "email" OR "support"`;
      window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
    } catch {}
  };

  const handleAutoDetect = () => {
    setIsFetching(true);
    // Apply logical guess instantly without making server requests blocked by CORS
    const guessed = guessEmailHeuristic();
    setTimeout(() => {
      onUpdateEmail(guessed);
      setIsFetching(false);
      setAppliedBadge("Pattern Applied!");
      setTimeout(() => setAppliedBadge(null), 2000);
    }, 350);
  };

  return (
    <div
      className={`flex flex-col gap-2 mt-4 bg-slate-50 dark:bg-stone-900/90 p-3.5 rounded-xl border border-slate-200 dark:border-stone-800 ${className}`}
    >
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-slate-700 dark:text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>Target Email {currentEmail ? "" : "(Manual)"}</span>
          {appliedBadge && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold lowercase bg-emerald-100 dark:bg-emerald-950/70 px-1.5 py-0.2 rounded">
              {appliedBadge}
            </span>
          )}
        </label>

        {/* Cognitive Assistance Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAutoDetect}
            disabled={isFetching}
            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 dark:hover:bg-blue-900 px-2 py-1 rounded-md font-bold transition-colors flex items-center gap-1 cursor-pointer"
            title="Apply standard B2B pattern heuristic guess (hello@domain.com)"
          >
            <Sparkles className="h-3 w-3" />
            <span>{isFetching ? "..." : "⚡ Guess Pattern"}</span>
          </button>
          <button
            type="button"
            onClick={handleGoogleSearch}
            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 px-2 py-1 rounded-md font-bold transition-colors flex items-center gap-1 cursor-pointer"
            title="Search public store email directly with Google Search Dorking"
          >
            <Search className="h-3 w-3" />
            <span>🔍 Search Google</span>
          </button>
        </div>
      </div>

      <input
        type="email"
        value={currentEmail}
        onChange={(e) => onUpdateEmail(e.target.value)}
        onFocus={onFocus}
        placeholder="Or type manually (e.g. owner@store.com or support@store.com)"
        className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm font-mono border border-slate-300 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-950 text-slate-900 dark:text-stone-100 placeholder:text-slate-400 dark:placeholder:text-stone-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none shadow-xs"
      />
    </div>
  );
}



