"use client";

import React from "react";
import { AlertCircle, ArrowUpRight, CheckCircle2, DollarSign, Store, ShoppingBag } from "lucide-react";
import { StoreAuditResult } from "@/lib/types";

interface StatsOverviewProps {
  results: StoreAuditResult[];
  onFilterChange: (filter: "all" | "oos_only" | "clean_only" | "failed_only") => void;
  currentFilter: "all" | "oos_only" | "clean_only" | "failed_only";
}

export function StatsOverview({ results, onFilterChange, currentFilter }: StatsOverviewProps) {
  const completedAudits = results.filter((r) => r.status !== "idle" && r.status !== "scanning");
  const oosStores = results.filter((r) => r.status === "success" && r.soldOutCount > 0);
  const cleanStores = results.filter((r) => r.status === "no_oos");
  const totalOOSItems = results.reduce((acc, r) => acc + (r.soldOutCount || 0), 0);
  const totalVariantsScanned = results.reduce((acc, r) => acc + (r.totalVariantsScanned || 0), 0);
  const totalProductsScanned = results.reduce((acc, r) => acc + (r.totalProductsScanned || 0), 0);

  if (completedAudits.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      {/* Stores Audited */}
      <div
        id="stat-stores-audited"
        onClick={() => onFilterChange("all")}
        className={`cursor-pointer rounded-2xl border p-4 transition-all ${
          currentFilter === "all"
            ? "border-stone-900 bg-stone-900 text-white shadow-md dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950"
            : "border-stone-200 bg-white text-stone-900 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
        }`}
      >
        <div className="flex items-center justify-between text-xs opacity-70 mb-2">
          <span className="font-medium">Stores Audited</span>
          <Store className="h-4 w-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{completedAudits.length}</span>
          <span className="text-xs opacity-60">of {results.length} queued</span>
        </div>
        <div className="mt-2 text-xs opacity-80 flex items-center gap-1">
          <span>{totalProductsScanned.toLocaleString()} products analyzed</span>
        </div>
      </div>

      {/* High-Risk Out-of-Stock Stores */}
      <div
        id="stat-oos-stores"
        onClick={() => onFilterChange("oos_only")}
        className={`cursor-pointer rounded-2xl border p-4 transition-all ${
          currentFilter === "oos_only"
            ? "border-amber-600 bg-amber-500 text-white shadow-md"
            : "border-amber-200 bg-amber-50/70 text-amber-950 hover:border-amber-300 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"
        }`}
      >
        <div className="flex items-center justify-between text-xs opacity-80 mb-2">
          <span className="font-medium">Out-of-Stock Detected</span>
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{oosStores.length}</span>
          <span className="text-xs opacity-70">
            {completedAudits.length > 0
              ? `${Math.round((oosStores.length / completedAudits.length) * 100)}% of stores`
              : "0%"}
          </span>
        </div>
        <div className="mt-2 text-xs opacity-80 flex items-center gap-1">
          <span>Prime targets for AI pitch</span>
          <ArrowUpRight className="h-3 w-3 inline" />
        </div>
      </div>

      {/* Total Sold Out SKUs */}
      <div
        id="stat-oos-skus"
        className="rounded-2xl border border-stone-200 bg-white p-4 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
      >
        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-2">
          <span className="font-medium">Total OOS SKUs Found</span>
          <ShoppingBag className="h-4 w-4 text-rose-500" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
            {totalOOSItems.toLocaleString()}
          </span>
          <span className="text-xs text-stone-500">variants</span>
        </div>
        <div className="mt-2 text-xs text-stone-500">
          Actively unavailable to shoppers
        </div>
      </div>

      {/* Total Catalog SKUs Audited */}
      <div
        id="stat-total-skus"
        className="rounded-2xl border border-stone-200 bg-white p-4 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
      >
        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-2">
          <span className="font-medium">Total SKUs Audited</span>
          <CheckCircle2 className="h-4 w-4 text-indigo-500" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            {totalVariantsScanned.toLocaleString()}
          </span>
          <span className="text-xs text-stone-500">variants</span>
        </div>
        <div className="mt-2 text-xs text-stone-500">
          Scanned across live Shopify catalogs
        </div>
      </div>
    </div>
  );
}



