"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Header } from "@/components/Header";
import { StatsOverview } from "@/components/StatsOverview";
import { StoreAuditCard } from "@/components/StoreAuditCard";
import { BulkStoreModal } from "@/components/BulkStoreModal";
import { PythonScriptModal } from "@/components/PythonScriptModal";
import { EmailOutreachDrawer } from "@/components/EmailOutreachDrawer";
import PostAuditManager from "@/components/PostAuditManager";
import { DEFAULT_STORES } from "@/lib/presets";
import { StoreAuditResult, EmailTone } from "@/lib/types";
import { getCleanDomain, createInitialStoreResult } from "@/lib/storage";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  Search,
  Sparkles,
  RefreshCw,
  X,
  ShieldAlert,
  AlertCircle,
  ChevronUp,
  Zap,
  Mail,
} from "lucide-react";

export default function HomePage() {
  // 1. Persistent State synchronization with localStorage
  const [queue, setQueue] = usePersistentState<string[]>("audit_queue", []);
  const [successfulLeads, setSuccessfulLeads] = usePersistentState<StoreAuditResult[]>("audit_success", []);
  const [failedStores, setFailedStores] = usePersistentState<StoreAuditResult[]>("audit_failed", []);

  // Sakelar Utama Pembatalan (Deterministic Cancel Token)
  const cancelToken = useRef(false);

  // Ephemeral UI states
  const [isDashboardOpen, setIsDashboardOpen] = useState(false); // Default tertutup di mobile & audit view
  const [inputUrl, setInputUrl] = useState("");
  const [scanningMap, setScanningMap] = useState<Record<string, boolean>>({});
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [activeScanProgress, setActiveScanProgress] = useState({ current: 0, total: 0 });
  const [filter, setFilter] = useState<"all" | "oos_only" | "clean_only" | "failed_only">("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Spatial scroll listener
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 280);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Modals
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPythonModal, setShowPythonModal] = useState(false);
  const [showOutreachModal, setShowOutreachModal] = useState(false);

  // Initialize demo presets if user arrives on an empty queue
  const handleLoadDemoStores = () => {
    const demoUrls = DEFAULT_STORES.map((s) => s.url);
    setQueue((prev) => {
      const existing = new Set(prev.map(getCleanDomain));
      const toAdd = demoUrls.filter((u) => !existing.has(getCleanDomain(u)));
      return [...prev, ...toAdd];
    });
  };

  // Run audit for a single store
  const auditStore = useCallback(
    async (url: string, autoGenerateEmail: boolean = true) => {
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }
      const cleanDomain = getCleanDomain(formattedUrl);

      // Ensure store exists in persistent queue, deduplicated by clean domain
      setQueue((prev) => {
        const exists = prev.some((u) => getCleanDomain(u) === cleanDomain);
        if (!exists) {
          return [formattedUrl, ...prev];
        }
        return prev;
      });

      setScanningMap((prev) => ({ ...prev, [cleanDomain]: true }));

      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: formattedUrl, autoGenerateEmail, tone: "sharp_3_sentence" }),
        });

        const data = await res.json();
        if (data.result) {
          const result: StoreAuditResult = data.result;
          if (result.status === "success" || result.status === "no_oos") {
            // Save to successfulLeads, remove from failedStores
            setSuccessfulLeads((prev) => [
              result,
              ...prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== cleanDomain),
            ]);
            setFailedStores((prev) =>
              prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== cleanDomain)
            );
          } else {
            // Error or Bot Protected store: Save to failedStores, remove from successfulLeads
            setFailedStores((prev) => [
              result,
              ...prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== cleanDomain),
            ]);
            setSuccessfulLeads((prev) =>
              prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== cleanDomain)
            );
          }
        } else {
          const errorResult: StoreAuditResult = {
            ...createInitialStoreResult(formattedUrl),
            status: "error",
            errorMessage: data.error || "Failed to retrieve store catalog",
            diagnosticNote: data.error || "Catalog unreachable or blocked",
          };
          setFailedStores((prev) => [
            errorResult,
            ...prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== cleanDomain),
          ]);
        }
      } catch (err) {
        console.error(`Audit failed for ${url}:`, err);
        const errorResult: StoreAuditResult = {
          ...createInitialStoreResult(formattedUrl),
          status: "error",
          errorMessage: "Network error or request timeout",
          diagnosticNote: "Could not establish connection to store catalog",
        };
        setFailedStores((prev) => [
          errorResult,
          ...prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== cleanDomain),
        ]);
      } finally {
        setScanningMap((prev) => ({ ...prev, [cleanDomain]: false }));
      }
    },
    [setQueue, setSuccessfulLeads, setFailedStores]
  );

  // Scan all stores in queue with paced delay and deterministic cancellation
  const handleScanAll = async () => {
    cancelToken.current = false; // Reset sakelar ke posisi ON
    setIsScanningAll(true);
    const urls = [...queue];
    setActiveScanProgress({ current: 0, total: urls.length });

    for (let i = 0; i < urls.length; i++) {
      // CEK SAKELAR: Jika user menekan batal, hentikan loop seketika
      if (cancelToken.current) {
        console.warn("Audit dibatalkan oleh pengguna.");
        break;
      }

      const targetUrl = urls[i];
      setActiveScanProgress({ current: i + 1, total: urls.length });
      await auditStore(targetUrl, true);

      // Cek sakelar lagi setelah auditStore selesai
      if (cancelToken.current) {
        console.warn("Audit dibatalkan oleh pengguna.");
        break;
      }

      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    setIsScanningAll(false);
  };

  // Matikan sakelar (berlaku instan)
  const handleCancelScan = () => {
    cancelToken.current = true;
    setIsScanningAll(false);
  };

  // Add single store via Live Store Audit input
  const handleAddSingleStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    let formatted = inputUrl.trim();
    if (!formatted.startsWith("http://") && !formatted.startsWith("https://")) {
      formatted = `https://${formatted}`;
    }

    const domain = getCleanDomain(formatted);

    setQueue((prev) => {
      const exists = prev.some((u) => getCleanDomain(u) === domain);
      if (!exists) {
        return [formatted, ...prev];
      }
      return prev;
    });

    const target = formatted;
    setInputUrl("");
    await auditStore(target, true);
  };

  // Add bulk stores
  const handleAddBulkStores = (newUrls: string[]) => {
    const formatted = newUrls.map((u) => {
      let f = u.trim();
      if (!f.startsWith("http://") && !f.startsWith("https://")) {
        f = `https://${f}`;
      }
      return f;
    });

    setQueue((prev) => {
      const existingDomains = new Set(prev.map(getCleanDomain));
      const toAdd: string[] = [];
      for (const u of formatted) {
        const domain = getCleanDomain(u);
        if (!existingDomains.has(domain)) {
          existingDomains.add(domain);
          toAdd.push(u);
        }
      }
      return [...prev, ...toAdd];
    });
  };

  // Remove store from queue, successfulLeads, and failedStores
  const handleRemoveStore = (domainOrId: string) => {
    const targetDomain = getCleanDomain(domainOrId);
    setQueue((prev) => prev.filter((u) => getCleanDomain(u) !== targetDomain));
    setSuccessfulLeads((prev) =>
      prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== targetDomain)
    );
    setFailedStores((prev) =>
      prev.filter((r) => getCleanDomain(r.cleanDomain || r.storeUrl) !== targetDomain)
    );
  };

  // Regenerate pitch for a specific store
  const handleRegeneratePitch = async (
    auditId: string,
    tone: EmailTone,
    senderName?: string,
    senderCompany?: string,
    customAngle?: string
  ) => {
    const current = successfulLeads.find(
      (r) => r.id === auditId || getCleanDomain(r.cleanDomain || r.storeUrl) === getCleanDomain(auditId)
    );
    if (!current || current.soldOutProducts.length === 0) return;

    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: current.storeName,
          storeUrl: current.storeUrl,
          soldOutProducts: current.soldOutProducts,
          totalVariants: current.totalVariantsScanned,
          soldOutRate: current.soldOutRate,
          tone,
          senderName,
          senderCompany,
          customAngle,
        }),
      });

      const data = await res.json();
      if (data.email) {
        setSuccessfulLeads((prev) =>
          prev.map((item) =>
            item.id === auditId || getCleanDomain(item.cleanDomain || item.storeUrl) === getCleanDomain(auditId)
              ? { ...item, generatedEmail: data.email }
              : item
          )
        );
      }
    } catch (err) {
      console.error("Failed to regenerate pitch:", err);
    }
  };

  const handleClearAll = () => {
    // 1. Konfirmasi deterministik (mencegah salah klik)
    const confirmDelete = typeof window !== "undefined" ? window.confirm("Hapus seluruh data toko yang sudah disidak?") : true;
    if (!confirmDelete) return;

    // 2. Hancurkan memori browser
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("audit_queue");
        localStorage.removeItem("audit_success");
        localStorage.removeItem("audit_failed");
      } catch (e) {
        console.error("Gagal menghapus localStorage:", e);
      }
    }

    // 3. Reset UI ke default awal
    setQueue([]);
    setSuccessfulLeads([]);
    setFailedStores([]);
    cancelToken.current = true; // Pastikan mesin berhenti jika sedang jalan
    setIsScanningAll(false);
  };

  // Combined audited results
  const allAudited = useMemo(() => {
    return [...successfulLeads, ...failedStores];
  }, [successfulLeads, failedStores]);

  // Lookup map for fast status resolution
  const statusLookup = useMemo(() => {
    const map: Record<string, StoreAuditResult> = {};
    for (const item of allAudited) {
      map[getCleanDomain(item.cleanDomain || item.storeUrl)] = item;
    }
    return map;
  }, [allAudited]);

  // Hot leads count (successful with OOS & generated email)
  const hotLeadsCount = useMemo(() => {
    return successfulLeads.filter(
      (r) => r.status === "success" && r.soldOutCount > 0 && r.generatedEmail
    ).length;
  }, [successfulLeads]);

  // Unified display items list: Audited leads + un-audited queue stores
  const displayItems = useMemo(() => {
    const list: StoreAuditResult[] = [];
    const seenDomains = new Set<string>();

    for (const r of allAudited) {
      const dom = getCleanDomain(r.cleanDomain || r.storeUrl);
      if (!seenDomains.has(dom)) {
        seenDomains.add(dom);
        list.push(r);
      }
    }

    for (const qUrl of queue) {
      const dom = getCleanDomain(qUrl);
      if (!seenDomains.has(dom)) {
        seenDomains.add(dom);
        list.push(createInitialStoreResult(qUrl));
      }
    }

    return list;
  }, [allAudited, queue]);

  const filteredResults = useMemo(() => {
    return displayItems.filter((item) => {
      if (filter === "oos_only") {
        return item.status === "success" && item.soldOutCount > 0;
      }
      if (filter === "clean_only") {
        return item.status === "no_oos";
      }
      if (filter === "failed_only") {
        return item.status === "error" || item.status === "protected";
      }
      return true;
    });
  }, [displayItems, filter]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100 flex flex-col font-sans">
      {/* Top Navbar (Accordion Header) */}
      <Header
        isOpen={isDashboardOpen}
        onToggleOpen={() => setIsDashboardOpen((prev) => !prev)}
        onOpenPythonModal={() => setShowPythonModal(true)}
        onOpenBulkModal={() => setShowBulkModal(true)}
        onOpenOutreachModal={() => setShowOutreachModal(true)}
        onScanAll={handleScanAll}
        onCancelScan={handleCancelScan}
        onClearAll={handleClearAll}
        isScanning={isScanningAll}
        activeScanCount={activeScanProgress.current}
        totalStoreCount={activeScanProgress.total || queue.length}
        hotLeadsCount={hotLeadsCount}
      />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 pb-32 space-y-6">
        {/* Main Input & Action Hero Card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs dark:border-stone-800 dark:bg-stone-900">
          <form onSubmit={handleAddSingleStore} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                id="single-store-url-input"
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onFocus={() => setIsDashboardOpen(false)}
                placeholder="Enter Shopify store URL (e.g. beardbrand.com or https://unitedbyblue.com)"
                className="w-full rounded-xl border border-stone-200 bg-stone-50/50 py-3 pl-10 pr-4 text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-stone-900/10 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-100"
              />
            </div>
            <button
              type="submit"
              id="submit-single-audit-btn"
              disabled={!inputUrl.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-xs font-medium text-white shadow-xs hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 transition-colors"
            >
              <Sparkles className="h-4 w-4 text-amber-300" />
              Audit Store & Draft Pitch
            </button>
          </form>

          {/* Target Stores Badges (synchronized with audit_queue state) */}
          <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
              Target Stores ({queue.length}):
            </span>
            {queue.length === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 italic">No stores in queue.</span>
                <button
                  type="button"
                  onClick={handleLoadDemoStores}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 underline"
                >
                  Load Demo Shopify Stores
                </button>
              </div>
            ) : (
              queue.map((url) => {
                const cleanDomain = getCleanDomain(url);
                const storeData = statusLookup[cleanDomain];
                const isDone = storeData?.status === "success" && storeData?.soldOutCount > 0;
                const isClean = storeData?.status === "no_oos";
                const isFailed = storeData?.status === "error" || storeData?.status === "protected";
                const isScanned = storeData?.status !== "idle" && storeData?.status !== undefined;
                const isScanning = scanningMap[cleanDomain];
                const displayName = storeData?.storeName || cleanDomain;

                return (
                  <div
                    key={cleanDomain}
                    className={`inline-flex items-center gap-1.5 rounded-lg border pl-2.5 pr-1.5 py-1 text-xs transition-all ${
                      isDone
                        ? "border-rose-300 bg-rose-50/80 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                        : isClean
                        ? "border-emerald-300 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : isFailed
                        ? "border-amber-300 bg-amber-50/80 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
                        : isScanned
                        ? "border-stone-300 bg-stone-100 text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                        : "border-stone-200 bg-stone-50/60 text-stone-700 hover:border-stone-300 hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-950/50 dark:text-stone-300 dark:hover:bg-stone-800"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => auditStore(url, true)}
                      className="inline-flex items-center gap-1.5 hover:underline focus:outline-hidden"
                      title={`Audit ${displayName}`}
                    >
                      <span>{displayName}</span>
                      {isDone && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                      {isClean && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                      {isFailed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                      {isScanning && <RefreshCw className="h-2.5 w-2.5 animate-spin text-amber-500" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStore(cleanDomain);
                      }}
                      title={`Remove ${displayName} from target list`}
                      className="p-0.5 rounded-sm text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Aggregate KPI Stats Banner */}
        <StatsOverview
          results={allAudited}
          currentFilter={filter}
          onFilterChange={setFilter}
        />

        {/* Laporan Eksekusi Bulk Audit & Karantina Proteksi */}
        {(successfulLeads.length > 0 || failedStores.length > 0) && (
          <PostAuditManager
            successfulAudits={successfulLeads}
            failedAudits={failedStores}
            onClearFailed={() => setFailedStores([])}
          />
        )}

        {/* Filter Toolbar & Queue Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Audit Stream & Cold Outreach Deck
            </h2>
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              {filteredResults.length} stores
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5">
            <button
              id="filter-all-btn"
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800"
              }`}
            >
              All Stores
            </button>
            <button
              id="filter-oos-btn"
              onClick={() => setFilter("oos_only")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "oos_only"
                  ? "bg-amber-600 text-white"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800"
              }`}
            >
              OOS Detected Only
            </button>
            <button
              id="filter-clean-btn"
              onClick={() => setFilter("clean_only")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "clean_only"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800"
              }`}
            >
              All In Stock
            </button>
            {failedStores.length > 0 && (
              <button
                id="filter-failed-btn"
                onClick={() => setFilter("failed_only")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  filter === "failed_only"
                    ? "bg-rose-600 text-white"
                    : "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 dark:bg-stone-900 dark:text-rose-300 dark:border-rose-900/60"
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                <span>Failed / Blocked ({failedStores.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Store Cards Grid */}
        <div className="space-y-4">
          {filteredResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 p-12 text-center text-stone-500 dark:border-stone-800">
              <p className="text-sm font-medium">No stores match the current filter.</p>
              <button
                onClick={() => setFilter("all")}
                className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Reset filter to view all stores
              </button>
            </div>
          ) : (
            filteredResults.map((audit) => (
              <StoreAuditCard
                key={audit.id}
                audit={audit}
                isScanning={scanningMap[getCleanDomain(audit.cleanDomain || audit.storeUrl)]}
                onReaudit={auditStore}
                onRemove={handleRemoveStore}
                onRegeneratePitch={handleRegeneratePitch}
                onFocusEmailInput={() => setIsDashboardOpen(false)}
              />
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-6 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900 text-center">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Shopify Out-of-Stock & AI Cold Outreach Engine</span>
          <span className="text-stone-400">
            Persistent Store & Lead Sync Active
          </span>
        </div>
      </footer>

      {/* Bilah navigasi bawah murni teks (Clean Minimalist - Bebas Tumpang Tindih) */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-zinc-950 border-t border-zinc-800 z-50 flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">
              Antrean
            </span>
            <span className="text-base font-bold text-zinc-100 font-mono">
              {isScanningAll
                ? `${activeScanProgress.current} / ${activeScanProgress.total} Diproses`
                : `${queue.length} Toko`}
            </span>
          </div>

          {/* Fungsi Ke Atas terintegrasi sebagai teks minimalis */}
          <button
            onClick={scrollToTop}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors uppercase tracking-wider cursor-pointer"
          >
            Ke Atas
          </button>

          {hotLeadsCount > 0 && (
            <button
              onClick={() => setShowOutreachModal(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-colors"
            >
              <Mail className="h-3 w-3 text-indigo-400" />
              <span>{hotLeadsCount} Leads OOS</span>
            </button>
          )}
        </div>

        {isScanningAll ? (
          <button
            id="sticky-cancel-scan-btn"
            onClick={handleCancelScan}
            className="bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white px-6 py-2.5 rounded text-sm font-bold tracking-wide transition-colors flex items-center gap-2 cursor-pointer animate-pulse"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Batal ({activeScanProgress.current}/{activeScanProgress.total})</span>
          </button>
        ) : (
          <button
            id="sticky-start-scan-btn"
            onClick={handleScanAll}
            disabled={queue.length === 0}
            className="bg-zinc-100 text-zinc-950 px-6 py-2.5 rounded text-sm font-bold tracking-wide hover:bg-white active:bg-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Audit Semua ({queue.length})
          </button>
        )}
      </div>

      {/* Modals */}
      <BulkStoreModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onAddStores={handleAddBulkStores}
      />

      <PythonScriptModal
        isOpen={showPythonModal}
        onClose={() => setShowPythonModal(false)}
      />

      <EmailOutreachDrawer
        isOpen={showOutreachModal}
        onClose={() => setShowOutreachModal(false)}
        results={successfulLeads}
      />
    </div>
  );
}



