"use client";

import React, { useState } from "react";
import {
  Layers,
  Terminal,
  Mail,
  Zap,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface HeaderProps {
  onOpenPythonModal: () => void;
  onOpenBulkModal: () => void;
  onOpenOutreachModal: () => void;
  onScanAll: () => void;
  onCancelScan?: () => void;
  onClearAll: () => void;
  isScanning: boolean;
  activeScanCount: number;
  totalStoreCount: number;
  hotLeadsCount: number;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export function Header({
  onOpenPythonModal,
  onOpenBulkModal,
  onOpenOutreachModal,
  onScanAll,
  onCancelScan,
  onClearAll,
  isScanning,
  activeScanCount,
  totalStoreCount,
  hotLeadsCount,
  isOpen,
  onToggleOpen,
}: HeaderProps) {
  // Local fallback state if uncontrolled
  const [internalOpen, setInternalOpen] = useState(false);
  const isDashboardOpen = isOpen !== undefined ? isOpen : internalOpen;

  const handleToggle = () => {
    if (onToggleOpen) {
      onToggleOpen();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  return (
    <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 sticky top-0 z-40 transition-all duration-300 shadow-xs">
      {/* PULL-DOWN BUTTON / ACCORDION TRIGGER (Always Visible) */}
      <div
        onClick={handleToggle}
        className="flex items-center justify-between px-4 sm:px-6 py-2.5 cursor-pointer bg-stone-50/90 hover:bg-stone-100/90 dark:bg-stone-900 dark:hover:bg-stone-800/80 transition-colors select-none"
        title="Click to open/close navigation menu panel"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-900 dark:bg-emerald-800 text-white rounded-xl flex items-center justify-center font-bold text-xs shadow-xs">
            N
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100 tracking-tight">
              Shopify OOS Auditor {isDashboardOpen ? "" : "(Click for Menu)"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Sparkles className="h-2.5 w-2.5" />
              Gemini 3.7 Flash
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Counter Preview when Collapsed */}
          {!isDashboardOpen && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-stone-500 dark:text-stone-400">
              {totalStoreCount > 0 && <span>{totalStoreCount} Stores</span>}
              {hotLeadsCount > 0 && (
                <span className="rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 text-xs font-bold">
                  {hotLeadsCount} Leads
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            className="p-1 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
            aria-label={isDashboardOpen ? "Close menu panel" : "Open menu panel"}
          >
            {isDashboardOpen ? (
              <ChevronUp className="h-5 w-5 transition-transform" />
            ) : (
              <ChevronDown className="h-5 w-5 transition-transform" />
            )}
          </button>
        </div>
      </div>

      {/* ACCORDION PANEL CONTENT (Can be smoothly hidden) */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isDashboardOpen
            ? "max-h-[500px] p-4 sm:p-5 opacity-100 border-t border-stone-200 dark:border-stone-800"
            : "max-h-0 opacity-0 p-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto max-w-7xl">
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mb-4">
            Find out-of-stock products & draft cold emails offering Back-in-Stock / Pre-Order waitlist setup to capture high-intent buyers
          </p>

          {/* Feature Buttons Collection */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              id="open-python-script-btn"
              onClick={onOpenPythonModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors"
            >
              <Terminal className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
              <span>Python Script</span>
            </button>

            <button
              id="open-bulk-modal-btn"
              onClick={onOpenBulkModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
              <span>Bulk Add</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="open-outreach-campaign-btn"
              onClick={onOpenOutreachModal}
              className="relative inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/80 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Outreach Leads</span>
              {hotLeadsCount > 0 && (
                <span className="rounded-full bg-indigo-600 px-1.5 py-0.2 text-xs font-bold text-white">
                  {hotLeadsCount}
                </span>
              )}
            </button>

            <button
              id="clear-all-data-btn"
              onClick={onClearAll}
              disabled={isScanning && totalStoreCount === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/80 transition-colors"
              title="Clear all store data and reset local storage"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Data</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}



