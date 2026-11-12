"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  ShieldAlert,
  Download,
  Trash2,
  RotateCw,
  ExternalLink,
  Mail,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Zap,
} from "lucide-react";
import { StoreAuditResult } from "@/lib/types";
import { getCleanDomain } from "@/lib/storage";

interface VisualTriageZoneProps {
  successfulStores: StoreAuditResult[];
  blockedStores: StoreAuditResult[];
  onReauditStore: (url: string) => void;
  onReauditAllBlocked?: () => void;
  onClearBlocked: () => void;
  onRemoveStore: (domainOrId: string) => void;
  onOpenOutreachModal?: () => void;
  onSelectStoreToView?: (domain: string) => void;
  isScanning?: boolean;
}

export function VisualTriageZone({
  successfulStores,
  blockedStores,
  onReauditStore,
  onReauditAllBlocked,
  onClearBlocked,
  onRemoveStore,
  onOpenOutreachModal,
  onSelectStoreToView,
  isScanning = false,
}: VisualTriageZoneProps) {
  const [filterOOSOnly, setFilterOOSOnly] = useState(false);

  // Helper to export successful leads as CSV
  const handleExportLeadsCSV = () => {
    if (successfulStores.length === 0) return;

    const headers = [
      "Store Name",
      "Store URL",
      "Clean Domain",
      "Contact Email",
      "Status",
      "Total Scanned Variants",
      "OOS Items Count",
      "Sold Out Rate (%)",
      "Estimated Monthly Revenue At Risk",
      "Top OOS Products",
      "Email Pitch Subject",
      "Audited Date",
    ];

    const rows = successfulStores.map((s) => {
      const topOOS = s.topOOSProducts
        .map((p) => `${p.title} (${p.priceFormatted})`)
        .slice(0, 3)
        .join("; ");
      const subject = s.generatedEmail?.subject ? `"${s.generatedEmail.subject.replace(/"/g, '""')}"` : "";

      return [
        `"${(s.storeName || s.cleanDomain).replace(/"/g, '""')}"`,
        `"${s.storeUrl}"`,
        `"${s.cleanDomain || getCleanDomain(s.storeUrl)}"`,
        `"${s.contactEmail || ""}"`,
        `"${s.status}"`,
        s.totalVariantsScanned || 0,
        s.soldOutCount || 0,
        `${s.soldOutRate || 0}%`,
        `"${topOOS.replace(/"/g, '""')}"`,
        subject,
        `"${s.auditTimestamp || new Date().toISOString()}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shopify_audited_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const displayedSuccessful = filterOOSOnly
    ? successfulStores.filter((s) => s.soldOutCount > 0)
    : successfulStores;

  // Resolve concise error badge description
  const getFailureReason = (store: StoreAuditResult) => {
    if (store.status === "protected" || store.errorMessage?.toLowerCase().includes("cloudflare") || store.diagnosticNote?.toLowerCase().includes("cloudflare")) {
      return "Cloudflare / WAF Protected";
    }
    if (store.errorMessage?.toLowerCase().includes("403")) {
      return "HTTP 403 Forbidden";
    }
    if (store.errorMessage?.toLowerCase().includes("429") || store.diagnosticNote?.toLowerCase().includes("rate limit")) {
      return "HTTP 429 Rate Limited";
    }
    if (store.errorMessage?.toLowerCase().includes("timeout") || store.errorMessage?.toLowerCase().includes("network")) {
      return "Connection Failed / Timeout";
    }
    if (store.errorMessage?.toLowerCase().includes("404")) {
      return "404 Products JSON Disabled";
    }
    return store.errorMessage || store.diagnosticNote || "Failed to Read Catalog";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
      {/* GREEN ZONE: SUCCESSFULLY AUDITED URLS */}
      <div className="lg:col-span-7 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-xs flex flex-col">
        {/* Green Zone Header */}
        <div className="bg-emerald-50/90 dark:bg-emerald-950/40 p-3.5 sm:p-4 flex flex-wrap justify-between items-center gap-2 border-b border-emerald-200 dark:border-emerald-900/60">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                Green Zone: Successfully Audited ({successfulStores.length})
              </h3>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                Responsive catalog & OOS metrics ready for action
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {successfulStores.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setFilterOOSOnly(!filterOOSOnly)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                    filterOOSOnly
                      ? "bg-emerald-700 text-white border-emerald-700"
                      : "bg-white/80 dark:bg-stone-800 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                  }`}
                  title="Filter only stores with sold out items"
                >
                  {filterOOSOnly ? "All Successful" : "Filter OOS > 0"}
                </button>
                <button
                  type="button"
                  onClick={handleExportLeadsCSV}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-all"
                  title="Export successful audit results to CSV format"
                >
                  <Download className="h-3 w-3" />
                  <span>Export Leads</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Successfully Audited List */}
        <div className="p-3 sm:p-4 max-h-[380px] overflow-y-auto space-y-2 divide-y divide-stone-100 dark:divide-stone-800/60">
          {displayedSuccessful.length === 0 ? (
            <div className="text-center py-8 text-stone-400 dark:text-stone-500">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30 text-emerald-500" />
              <p className="text-xs font-medium text-stone-600 dark:text-stone-400">
                No store data passed audit yet.
              </p>
              <p className="text-xs mt-0.5">
                Enter store URL above or run &quot;Audit All Stores&quot;.
              </p>
            </div>
          ) : (
            displayedSuccessful.map((store) => {
              const cleanDomain = store.cleanDomain || getCleanDomain(store.storeUrl);
              const hasOOS = store.soldOutCount > 0;
              return (
                <div
                  key={store.id || cleanDomain}
                  className="pt-2 first:pt-0 group flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-xl hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5">
                      {hasOOS ? (
                        <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200 dark:ring-rose-900" />
                      ) : (
                        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate max-w-[200px] sm:max-w-[260px]">
                          {store.storeName || cleanDomain}
                        </span>
                        <a
                          href={store.storeUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                          title="Visit store website"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-stone-500 dark:text-stone-400 font-mono">
                        <span className="truncate">{cleanDomain}</span>
                        {store.contactEmail && (
                          <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                            <Mail className="h-2.5 w-2.5" />
                            {store.contactEmail}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <div className="text-right">
                      <span
                        className={`inline-block font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                          hasOOS
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        }`}
                      >
                        {store.soldOutCount} OOS ({store.soldOutRate}%)
                      </span>
                    </div>

                    {onSelectStoreToView && (
                      <button
                        type="button"
                        onClick={() => onSelectStoreToView(cleanDomain)}
                        className="p-1 rounded-md text-stone-400 hover:text-emerald-700 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 transition-colors"
                        title="Scroll & focus to full audit card"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RED ZONE: FAILED / CLOUDFLARE BLOCKED URLS */}
      <div className="lg:col-span-5 border border-rose-200 dark:border-rose-900/60 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-xs flex flex-col">
        {/* Red Zone Header */}
        <div className="bg-rose-50/90 dark:bg-rose-950/40 p-3.5 sm:p-4 flex justify-between items-center gap-2 border-b border-rose-200 dark:border-rose-900/60">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-xs">
              <ShieldAlert className="h-3.5 w-3.5" />
            </span>
            <div>
              <h3 className="font-bold text-sm text-rose-900 dark:text-rose-300">
                Red Zone: Failed / Blocked ({blockedStores.length})
              </h3>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
                Cloudflare WAF / Bot Protection / Timeout
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {blockedStores.length > 0 && (
              <>
                {onReauditAllBlocked && (
                  <button
                    type="button"
                    onClick={onReauditAllBlocked}
                    disabled={isScanning}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100 hover:underline disabled:opacity-50"
                    title="Retry auditing all stores in red zone"
                  >
                    <RotateCw className="h-3 w-3" />
                    <span>Retry All</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClearBlocked}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 dark:text-rose-400 hover:underline"
                  title="Clear all failed stores from red zone"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Failed / Blocked List */}
        <div className="p-3 sm:p-4 max-h-[380px] overflow-y-auto space-y-1.5 bg-rose-50/20 dark:bg-rose-950/10 divide-y divide-rose-100/80 dark:divide-rose-950/40">
          {blockedStores.length === 0 ? (
            <div className="text-center py-8 text-stone-400 dark:text-stone-500">
              <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-30 text-rose-400" />
              <p className="text-xs font-medium text-stone-600 dark:text-stone-400">
                No stores blocked or connection failures.
              </p>
              <p className="text-xs mt-0.5">
                All targets passed filtering or queue is clean.
              </p>
            </div>
          ) : (
            blockedStores.map((store) => {
              const cleanDomain = store.cleanDomain || getCleanDomain(store.storeUrl);
              const reason = getFailureReason(store);
              return (
                <div
                  key={store.id || cleanDomain}
                  className="pt-1.5 first:pt-0 flex items-center justify-between text-xs py-1.5"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-mono text-xs text-stone-800 dark:text-stone-200 truncate block">
                      {cleanDomain}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-md text-xs font-medium border border-rose-200 dark:border-rose-900/60 max-w-[150px] truncate" title={reason}>
                      {reason}
                    </span>
                    <button
                      type="button"
                      onClick={() => onReauditStore(store.storeUrl)}
                      disabled={isScanning}
                      className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors disabled:opacity-50"
                      title={`Retry audit for ${cleanDomain}`}
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveStore(cleanDomain)}
                      className="p-1 rounded text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      title={`Remove ${cleanDomain}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}



