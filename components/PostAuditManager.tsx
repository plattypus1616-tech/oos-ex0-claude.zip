"use client";

import React, { useState } from "react";
import { Check, Copy, Trash2, CheckCircle2, ShieldAlert, AlertTriangle } from "lucide-react";
import { StoreAuditResult } from "@/lib/types";

export interface AuditItemSummary {
  url?: string;
  storeUrl?: string;
  cleanDomain?: string;
  storeName?: string;
  reason?: string;
  errorMessage?: string;
  status?: string;
}

interface PostAuditManagerProps {
  successfulAudits: (StoreAuditResult | AuditItemSummary)[];
  failedAudits: (StoreAuditResult | AuditItemSummary)[];
  onClearFailed: () => void;
}

export default function PostAuditManager({
  successfulAudits,
  failedAudits,
  onClearFailed,
}: PostAuditManagerProps) {
  const [copyStatus, setCopyStatus] = useState<string>("Copy Failed URLs");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Helper to extract clean URL string
  const getUrl = (item: StoreAuditResult | AuditItemSummary): string => {
    if ("url" in item && item.url) return item.url;
    if ("storeUrl" in item && item.storeUrl) return item.storeUrl;
    if ("cleanDomain" in item && item.cleanDomain) {
      return item.cleanDomain.startsWith("http") ? item.cleanDomain : `https://${item.cleanDomain}`;
    }
    return "unknown-store";
  };

  // Helper to get failure reason label
  const getReason = (item: StoreAuditResult | AuditItemSummary): string => {
    if ("reason" in item && item.reason) return item.reason;
    if ("errorMessage" in item && item.errorMessage) {
      if (
        item.errorMessage.includes("403") ||
        item.errorMessage.toLowerCase().includes("cloudflare") ||
        item.errorMessage.toLowerCase().includes("bot")
      ) {
        return "Cloudflare 403";
      }
      if (item.errorMessage.includes("429") || item.errorMessage.toLowerCase().includes("rate limit")) {
        return "Rate Limit 429";
      }
      if (item.errorMessage.toLowerCase().includes("timeout")) {
        return "Timeout";
      }
      return item.errorMessage.length > 22 ? item.errorMessage.substring(0, 20) + "..." : item.errorMessage;
    }
    if ("status" in item && item.status === "protected") return "Cloudflare 403";
    return "Cloudflare 403";
  };

  // Core feature: Extraction (Cut/Copy) of Cloudflare-blocked URLs
  const handleCopyFailedUrls = () => {
    if (failedAudits.length === 0) return;

    // 1. Array refinement (Data Extraction) & 2. Deterministic clipboard format
    const rawUrls = failedAudits.map((store) => getUrl(store)).join("\n");

    navigator.clipboard.writeText(rawUrls).then(() => {
      setCopyStatus(" Successfully Copied!");
      setIsCopied(true);
      setTimeout(() => {
        setCopyStatus("Copy Failed URLs");
        setIsCopied(false);
      }, 2000);
    });
  };

  return (
    <div className="mt-6 border-t border-slate-200 dark:border-stone-800 pt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-black text-slate-800 dark:text-stone-100 flex items-center gap-2">
            Bulk Audit Execution Report
          </h3>
          <p className="text-xs text-slate-500 dark:text-stone-400">
            Monitoring bulk audit progress and Cloudflare / WAF protection quarantine management
          </p>
        </div>
        <div className="text-xs font-mono font-medium text-slate-500 dark:text-stone-400 bg-slate-100 dark:bg-stone-800 px-2.5 py-1 rounded-md">
          Total: {successfulAudits.length + failedAudits.length} Stores
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Panel: Success Signal (Survival) */}
        <div className="bg-green-50 border border-green-200 dark:bg-emerald-950/20 dark:border-emerald-900/60 p-4 rounded-xl flex flex-col h-full transition-all">
          <div className="flex justify-between items-center mb-3">
            <label className="font-bold text-sm text-green-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Successfully Audited
            </label>
            <span className="bg-green-200 text-green-800 dark:bg-emerald-900/80 dark:text-emerald-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {successfulAudits.length} Stores
            </span>
          </div>
          <div className="overflow-y-auto max-h-48 min-h-[120px] text-xs text-green-700 dark:text-emerald-400 space-y-1 p-2 bg-white/70 dark:bg-stone-900/70 rounded-lg border border-green-100 dark:border-emerald-950">
            {successfulAudits.length === 0 ? (
              <div className="text-slate-400 dark:text-stone-500 italic p-2 text-center">
                No store data successfully audited yet.
              </div>
            ) : (
              successfulAudits.map((store, i) => {
                const url = getUrl(store);
                return (
                  <div key={i} className="truncate font-mono py-0.5 px-1 rounded hover:bg-green-100/50 dark:hover:bg-emerald-900/30">
                    {url}
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 text-xs text-green-700/80 dark:text-emerald-400/80 flex items-center justify-between">
            <span>Ready to pitch & follow up</span>
            <span className="font-semibold">
              {successfulAudits.length > 0 && failedAudits.length + successfulAudits.length > 0
                ? `${Math.round((successfulAudits.length / (successfulAudits.length + failedAudits.length)) * 100)}% Success Rate`
                : ""}
            </span>
          </div>
        </div>

        {/* Right Panel: Entropy (Cloudflare/Failed Quarantine) */}
        <div className="bg-red-50 border border-red-200 dark:bg-rose-950/20 dark:border-rose-900/60 p-4 rounded-xl flex flex-col h-full transition-all">
          <div className="flex justify-between items-center mb-3">
            <label className="font-bold text-sm text-red-800 dark:text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              Failed / Blocked
            </label>
            <span className="bg-red-200 text-red-800 dark:bg-rose-900/80 dark:text-rose-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {failedAudits.length} Stores
            </span>
          </div>

          <div className="overflow-y-auto max-h-48 min-h-[120px] text-xs text-red-700 dark:text-rose-400 space-y-1.5 p-2 bg-white/70 dark:bg-stone-900/70 rounded-lg border border-red-100 dark:border-rose-950">
            {failedAudits.length === 0 ? (
              <div className="text-slate-400 dark:text-stone-500 italic p-2 text-center">
                Clean, no blocks.
              </div>
            ) : (
              failedAudits.map((store, i) => {
                const url = getUrl(store);
                const reason = getReason(store);
                return (
                  <div key={i} className="flex justify-between items-center border-b border-red-100/60 dark:border-rose-900/40 pb-1">
                    <span className="truncate w-2/3 font-mono text-xs">{url}</span>
                    <span className="w-1/3 text-right text-xs uppercase font-semibold text-rose-600 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-900/40 px-1.5 py-0.5 rounded">
                      {reason}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Action Area: Tactical Retreat */}
          <div className="mt-auto pt-4 flex gap-2">
            <button
              onClick={handleCopyFailedUrls}
              disabled={failedAudits.length === 0}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-rose-950 dark:disabled:text-rose-700 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
              title="Copy all failed URLs to execute via Python script / Proxy"
            >
              {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copyStatus}</span>
            </button>
            <button
              onClick={onClearFailed}
              disabled={failedAudits.length === 0}
              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-stone-800 dark:hover:bg-stone-700 disabled:opacity-50 text-slate-700 dark:text-stone-300 text-sm font-bold rounded-lg transition-colors flex items-center justify-center"
              title="Clear failed list"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



