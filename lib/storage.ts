import { useSyncExternalStore } from "react";
import { StoreAuditResult } from "@/lib/types";
import { DEFAULT_STORES } from "@/lib/presets";

export const STORAGE_KEY_TARGET_STORES = "targetStoreList";
export const STORAGE_KEY_AUDIT_RESULTS = "storeAuditResults";

export function getCleanDomain(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function createInitialStoreResult(url: string): StoreAuditResult {
  const cleanDomain = getCleanDomain(url);
  const parts = cleanDomain.split(".");
  const storeName =
    parts.length > 1 && parts[0] !== "myshopify"
      ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
      : cleanDomain;

  return {
    id: cleanDomain,
    storeUrl: url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`,
    cleanDomain,
    storeName,
    status: "idle",
    totalProductsScanned: 0,
    totalVariantsScanned: 0,
    soldOutCount: 0,
    soldOutRate: 0,
    soldOutProducts: [],
    availableProductsCount: 0,
    estDailyLoss: 0,
    estMonthlyLoss: 0,
    topOOSProducts: [],
    currency: "USD",
    auditTimestamp: "",
  };
}

const DEFAULT_URLS_SNAPSHOT: string[] = DEFAULT_STORES.map((s) => s.url);

const DEFAULT_RESULTS_SNAPSHOT: Record<string, StoreAuditResult> = (() => {
  const map: Record<string, StoreAuditResult> = {};
  for (const store of DEFAULT_STORES) {
    const item = createInitialStoreResult(store.url);
    map[item.cleanDomain] = item;
  }
  return map;
})();

type Listener = () => void;
let listeners: Listener[] = [];

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

let cachedUrls: string[] | null = null;
let cachedResults: Record<string, StoreAuditResult> | null = null;

function readSavedUrls(): string[] {
  if (typeof window === "undefined") return DEFAULT_URLS_SNAPSHOT;
  if (cachedUrls !== null) return cachedUrls;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TARGET_STORES);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedUrls = parsed as string[];
        return cachedUrls;
      }
    }
  } catch (err) {
    console.error("Failed to read targetStoreList from localStorage:", err);
  }
  cachedUrls = DEFAULT_URLS_SNAPSHOT;
  return cachedUrls;
}

function readSavedResults(): Record<string, StoreAuditResult> {
  if (typeof window === "undefined") return DEFAULT_RESULTS_SNAPSHOT;
  if (cachedResults !== null) return cachedResults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT_RESULTS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const resultsMap = parsed as Record<string, StoreAuditResult>;
        cachedResults = resultsMap;
        return resultsMap;
      }
    }
  } catch (err) {
    console.error("Failed to read storeAuditResults from localStorage:", err);
  }
  cachedResults = DEFAULT_RESULTS_SNAPSHOT;
  return cachedResults;
}

export const storePersistence = {
  subscribe(listener: Listener) {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
  getStoreUrls() {
    return readSavedUrls();
  },
  getServerStoreUrls() {
    return DEFAULT_URLS_SNAPSHOT;
  },
  getResults() {
    return readSavedResults();
  },
  getServerResults() {
    return DEFAULT_RESULTS_SNAPSHOT;
  },
  setStoreUrls(updater: string[] | ((prev: string[]) => string[])) {
    const current = readSavedUrls();
    const next = typeof updater === "function" ? updater(current) : updater;
    cachedUrls = next;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_TARGET_STORES, JSON.stringify(next));
      } catch (err) {
        console.error("Failed to write targetStoreList to localStorage:", err);
      }
    }
    emitChange();
  },
  setResults(
    updater:
      | Record<string, StoreAuditResult>
      | ((prev: Record<string, StoreAuditResult>) => Record<string, StoreAuditResult>)
  ) {
    const current = readSavedResults();
    const next = typeof updater === "function" ? updater(current) : updater;
    cachedResults = next;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_AUDIT_RESULTS, JSON.stringify(next));
      } catch (err) {
        console.error("Failed to write storeAuditResults to localStorage:", err);
      }
    }
    emitChange();
  },
};

export function useStoreUrls() {
  const urls = useSyncExternalStore(
    storePersistence.subscribe,
    storePersistence.getStoreUrls,
    storePersistence.getServerStoreUrls
  );
  return [urls, storePersistence.setStoreUrls] as const;
}

export function useAuditResults() {
  const results = useSyncExternalStore(
    storePersistence.subscribe,
    storePersistence.getResults,
    storePersistence.getServerResults
  );
  return [results, storePersistence.setResults] as const;
}



