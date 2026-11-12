"use client";

import React, { useState, useMemo } from "react";
import { X, Plus, Layers, Sparkles, AlertTriangle, CheckCircle2, ShieldAlert, Trash2, Filter } from "lucide-react";
import { DEFAULT_STORES } from "@/lib/presets";

export interface ProcessedBulkResult {
  validQueue: { url: string; domain: string }[];
  invalidQueue: { url: string; reason: string }[];
}

export function processBulkInput(rawText: string): ProcessedBulkResult {
  // 1. Split text by newlines or commas
  const rawList = rawText.split(/[\n,]+/);
  const validQueue: { url: string; domain: string }[] = [];
  const invalidQueue: { url: string; reason: string }[] = [];
  const seenDomains = new Set<string>();

  // 2. Regex to validate basic domain / Shopify store format
  const domainRegex = /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/i;

  rawList.forEach((item) => {
    const cleanItem = item.trim();
    if (!cleanItem || cleanItem.startsWith("#")) return;

    // Filter junk text that is clearly not a URL/Domain (e.g. "hello", "123", "random text")
    const match = cleanItem.match(domainRegex);
    if (match && cleanItem.includes(".")) {
      let formatted = cleanItem.toLowerCase();
      if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
        formatted = `https://${formatted}`;
      }
      try {
        const parsed = new URL(formatted);
        const domain = parsed.hostname.replace(/^www\./, "");
        if (domain.includes(".") && !seenDomains.has(domain)) {
          seenDomains.add(domain);
          validQueue.push({ url: formatted, domain });
        } else if (seenDomains.has(domain)) {
          // Duplicates ignored to keep queue clean
        } else {
          invalidQueue.push({ url: cleanItem, reason: "Incomplete Domain" });
        }
      } catch {
        invalidQueue.push({ url: cleanItem, reason: "Invalid URL Format" });
      }
    } else {
      invalidQueue.push({ url: cleanItem, reason: "Invalid Format / Not Shopify" });
    }
  });

  return { validQueue, invalidQueue };
}

interface BulkStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStores: (urls: string[]) => void;
}

export function BulkStoreModal({ isOpen, onClose, onAddStores }: BulkStoreModalProps) {
  const [rawInput, setRawInput] = useState("");

  const { validQueue, invalidQueue } = useMemo(() => {
    return processBulkInput(rawInput);
  }, [rawInput]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validQueue.length > 0) {
      onAddStores(validQueue.map((item) => item.url));
      setRawInput("");
      onClose();
    }
  };

  const handleLoadDefaults = () => {
    const defaultList = DEFAULT_STORES.map((s) => s.url).join("\n");
    setRawInput(defaultList);
  };

  const handleClear = () => {
    setRawInput("");
  };

  return (
    <div
      id="bulk-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="bulk-modal-content"
        className="w-full max-w-3xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-800 dark:bg-stone-900 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-base flex items-center gap-2">
                Bulk Add & Signal URL Filter
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Separate signal (valid Shopify URLs) from noise (dead URLs / corrupted text) before computation begins
              </p>
            </div>
          </div>
          <button
            id="close-bulk-modal-btn"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content: Two-Panel Grid (Clean Signal vs Quarantine Zone) */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Panel: Input & Clean Signal */}
            <div className="flex flex-col gap-2.5 bg-stone-50/50 dark:bg-stone-950/40 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-indigo-500" />
                  Clean Targets (Ready to Audit)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadDefaults}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    title="Fill benchmark 9 stores sample"
                  >
                    <Sparkles className="h-3 w-3" />
                    Fill Benchmark
                  </button>
                  {rawInput && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5"
                      title="Clear input"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id="bulk-raw-input"
                rows={7}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="Paste URLs here (1 per line or comma)...&#10;Example:&#10;beardbrand.com&#10;https://tazachocolate.com&#10;hiutdenim.co.uk"
                className="w-full rounded-xl border border-stone-200 bg-white p-3 text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-indigo-400"
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {validQueue.length} Valid Filtered URLs
                </span>
                {validQueue.length > 0 && (
                  <span className="text-xs text-stone-500">
                    Ready for processing
                  </span>
                )}
              </div>
            </div>

            {/* Right Panel: Quarantine Zone (Isolated Entropy) */}
            <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 flex flex-col h-full">
              <div className="flex items-center justify-between pb-2 border-b border-rose-200/60 dark:border-rose-900/50">
                <label className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  Quarantine Zone (Failed/Invalid)
                </label>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-rose-200/70 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                  {invalidQueue.length} Isolated Noise
                </span>
              </div>

              <div className="overflow-y-auto max-h-56 mt-2.5 text-xs text-rose-700 dark:text-rose-300 space-y-1.5 flex-1 pr-1">
                {invalidQueue.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8 text-rose-500/80 dark:text-rose-400/70">
                    <CheckCircle2 className="h-7 w-7 mb-1 text-emerald-500 opacity-80" />
                    <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
                      All Inputs Clean
                    </p>
                    <p className="text-xs text-stone-400">
                      No dead URLs or corrupted formats detected.
                    </p>
                  </div>
                ) : (
                  invalidQueue.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-white/80 dark:bg-stone-900/80 p-2 rounded-lg border border-rose-200/70 dark:border-rose-900/60 text-xs font-mono"
                    >
                      <span className="truncate w-3/5 text-stone-800 dark:text-stone-200 font-semibold" title={q.url}>
                        {q.url}
                      </span>
                      <span className="text-xs text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60 shrink-0 font-sans">
                        {q.reason}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800">
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {validQueue.length} valid stores ready to add to audit queue
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="submit-bulk-urls-btn"
                disabled={validQueue.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-all active:scale-[0.99]"
              >
                <Plus className="h-4 w-4" />
                Submit ({validQueue.length}) Clean Signals to Engine
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}



