"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Mail,
  RefreshCw,
  Sparkles,
  ShoppingBag,
  Clock,
  ShieldAlert,
  SlidersHorizontal,
  Send,
  X,
} from "lucide-react";
import { StoreAuditResult, EmailTone } from "@/lib/types";
import { TONE_LABELS } from "@/lib/presets";
import { getCleanDomain } from "@/lib/storage";
import EmailInputManager from "@/components/EmailInputManager";

interface StoreAuditCardProps {
  audit: StoreAuditResult;
  onReaudit: (url: string) => void;
  onRemove: (id: string) => void;
  onRegeneratePitch: (
    auditId: string,
    tone: EmailTone,
    senderName?: string,
    senderCompany?: string,
    customAngle?: string
  ) => Promise<void>;
  isScanning?: boolean;
  onFocusEmailInput?: () => void;
}

export function StoreAuditCard({
  audit,
  onReaudit,
  onRemove,
  onRegeneratePitch,
  isScanning = false,
  onFocusEmailInput,
}: StoreAuditCardProps) {
  const [expandedProducts, setExpandedProducts] = useState(false);
  const [selectedTone, setSelectedTone] = useState<EmailTone>("sharp_3_sentence");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [showPitchCustomizer, setShowPitchCustomizer] = useState(false);
  const [customAngle, setCustomAngle] = useState("");
  const [senderName, setSenderName] = useState("Alex");
  const [senderCompany, setSenderCompany] = useState("Phantom Inventory AI");
  const [contactEmail, setContactEmail] = useState(audit.contactEmail || "");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [activeVariant, setActiveVariant] = useState<"A" | "B">("A");
  const [selectedSubjectOverride, setSelectedSubjectOverride] = useState<string | null>(null);

  const hasOOS = audit.soldOutCount > 0;
  const isProtected = audit.status === "protected";
  const isError = audit.status === "error";

  const activeSubject =
    selectedSubjectOverride ||
    (activeVariant === "B" && audit.generatedEmail?.variantB
      ? audit.generatedEmail.variantB.subject
      : audit.generatedEmail?.subject || "");

  const activeBody =
    activeVariant === "B" && audit.generatedEmail?.variantB
      ? audit.generatedEmail.variantB.body
      : audit.generatedEmail?.body || "";

  // 1. Email Button Handler
  const handleOpenEmailApp = () => {
    // Verify email availability from scraped result
    const targetEmail = (contactEmail || audit.contactEmail)?.trim();

    if (!targetEmail) {
      alert("Failed: Store email not detected from scraping. Please search manually on the client's website.");
      return; // Stop execution, prevent empty mailto:
    }

    if (!audit.generatedEmail) return;

    // Extract active email details
    const subject = encodeURIComponent(activeSubject);
    const body = encodeURIComponent(activeBody);

    // Safely execute mailto protocol
    window.location.assign(`mailto:${targetEmail}?subject=${subject}&body=${body}`);
  };

  const handleCopyEmail = async () => {
    if (!activeBody) return;
    const fullText = `Subject: ${activeSubject}\n\n${activeBody}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {}
  };

  const handleCopySubject = async (subj: string) => {
    try {
      await navigator.clipboard.writeText(subj);
      setCopiedSubject(true);
      setTimeout(() => setCopiedSubject(false), 1500);
    } catch {}
  };

  const handleToneSwitch = async (newTone: EmailTone) => {
    setSelectedTone(newTone);
    setIsRegenerating(true);
    try {
      await onRegeneratePitch(audit.id, newTone, senderName, senderCompany, customAngle);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCustomRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegenerating(true);
    try {
      await onRegeneratePitch(audit.id, selectedTone, senderName, senderCompany, customAngle);
      setShowPitchCustomizer(false);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div
      id={`store-card-${audit.cleanDomain || getCleanDomain(audit.storeUrl)}`}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        hasOOS
          ? "border-stone-200 bg-white shadow-xs dark:border-stone-800 dark:bg-stone-900"
          : isProtected
          ? "border-amber-200/80 bg-amber-50/30 dark:border-amber-900/40 dark:bg-stone-900"
          : isError
          ? "border-rose-200/80 bg-rose-50/20 dark:border-rose-900/30 dark:bg-stone-900"
          : "border-stone-200 bg-stone-50/40 dark:border-stone-800 dark:bg-stone-900/60"
      }`}
    >
      {/* Top Banner & Header */}
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                {audit.storeName}
              </h3>
              <a
                href={audit.storeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-indigo-600 dark:text-stone-400 dark:hover:text-indigo-400"
              >
                {audit.cleanDomain}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Diagnostic note or latency */}
            <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
              {audit.latencyMs !== undefined && (
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  <Clock className="h-3 w-3" />
                  {audit.latencyMs}ms
                </span>
              )}
              {audit.totalProductsScanned > 0 && (
                <span>
                  {audit.totalProductsScanned} products ({audit.totalVariantsScanned} variants scanned)
                </span>
              )}
            </div>
          </div>

          {/* Status Badge & Action */}
          <div className="flex items-center gap-2">
            {hasOOS ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                {audit.soldOutCount} Sold Out ({audit.soldOutRate}%)
              </span>
            ) : isProtected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <ShieldAlert className="h-3.5 w-3.5" />
                Bot Protected (403)
              </span>
            ) : isError ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                Error Scraping
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All In Stock
              </span>
            )}

            <button
              id={`reaudit-btn-${audit.id}`}
              onClick={() => onReaudit(audit.storeUrl)}
              disabled={isScanning}
              title="Re-audit Store"
              className="rounded-xl border border-stone-200 p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
            </button>

            <button
              id={`remove-store-btn-${audit.id}`}
              onClick={() => onRemove(audit.id)}
              title="Remove store from audit queue"
              className="rounded-xl border border-stone-200 p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:border-stone-700 dark:text-stone-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 dark:hover:border-rose-900/60 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Protected / Error Diagnostics */}
        {(isProtected || isError) && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">{audit.diagnosticNote || audit.errorMessage}</p>
            {isProtected && (
              <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
                This store has enabled Cloudflare Turnstile or customized Shopify product endpoints. You can run the provided Python script with residential proxies or custom session cookies.
              </p>
            )}
          </div>
        )}

        {/* Metrics Grid (Only if active products scanned) */}
        {hasOOS && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 pt-3 border-t border-stone-100 dark:border-stone-800/80">
            <div className="rounded-xl bg-stone-50 p-2.5 dark:bg-stone-950/50">
              <span className="block text-xs text-stone-500 dark:text-stone-400">Total Catalog SKUs</span>
              <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {audit.totalVariantsScanned} variants
              </span>
            </div>
            <div className="rounded-xl bg-stone-50 p-2.5 dark:bg-stone-950/50">
              <span className="block text-xs text-stone-500 dark:text-stone-400">Sold Out SKUs</span>
              <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                {audit.soldOutCount} items
              </span>
            </div>
            <div className="rounded-xl bg-stone-50 p-2.5 dark:bg-stone-950/50">
              <span className="block text-xs text-stone-500 dark:text-stone-400">OOS Rate</span>
              <span className="text-sm font-bold text-rose-700 dark:text-rose-400">
                {audit.soldOutRate}%
              </span>
            </div>
            <div className="rounded-xl bg-emerald-50/70 p-2.5 dark:bg-emerald-950/30">
              <span className="block text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                Active In-Stock
              </span>
              <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                {Math.max(0, audit.totalVariantsScanned - audit.soldOutCount)} SKUs
              </span>
            </div>
          </div>
        )}

        {/* Sold Out Products Inspector Toggle */}
        {hasOOS && (
          <div className="mt-4">
            <button
              id={`toggle-products-${audit.id}`}
              onClick={() => setExpandedProducts(!expandedProducts)}
              className="flex w-full items-center justify-between rounded-xl border border-stone-200/80 bg-stone-50/50 px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300 dark:hover:bg-stone-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-3.5 w-3.5 text-stone-500" />
                <span>
                  Inspect {audit.soldOutProducts.length} Sold Out Product{audit.soldOutProducts.length > 1 ? "s" : ""}
                </span>
                <span className="text-xs text-stone-400">
                  (Top: {audit.soldOutProducts[0]?.title} - ${audit.soldOutProducts[0]?.price.toFixed(2)})
                </span>
              </div>
              {expandedProducts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {/* Product List Drawer */}
            {expandedProducts && (
              <div className="mt-2.5 space-y-2 rounded-xl border border-stone-200/70 bg-stone-50/40 p-3 dark:border-stone-800 dark:bg-stone-950/60 max-h-72 overflow-y-auto">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {audit.soldOutProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded-lg border border-stone-200/60 bg-white p-2 text-xs dark:border-stone-800 dark:bg-stone-900"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 shrink-0 rounded-md object-cover border border-stone-200 dark:border-stone-700"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded-md bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400">
                            <ShoppingBag className="h-4 w-4" />
                          </div>
                        )}
                        <div className="truncate">
                          <p className="font-medium text-stone-900 dark:text-stone-100 truncate">
                            {product.title}
                          </p>
                          {product.variantTitle && (
                            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                              Variant: {product.variantTitle}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {product.priceFormatted}
                        </span>
                        <a
                          href={product.productUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open product on Shopify"
                          className="rounded-md p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Consultative Cold Outreach Section */}
      {hasOOS && audit.generatedEmail && (
        <div className="border-t border-stone-200 bg-stone-900 text-stone-100 dark:border-stone-800 dark:bg-stone-950 p-5">
          {/* Header & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-stone-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-700/60 text-emerald-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
                  B2B Outreach Engine
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                    High-Conversion Consultative
                  </span>
                </h4>
              </div>
            </div>

            {/* Tone Selector Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {(Object.keys(TONE_LABELS) as EmailTone[]).map((toneKey) => (
                <button
                  key={toneKey}
                  onClick={() => handleToneSwitch(toneKey)}
                  disabled={isRegenerating}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    selectedTone === toneKey
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-stone-100"
                  }`}
                >
                  {TONE_LABELS[toneKey].label.split(" ")[0]}
                </button>
              ))}

              <button
                id={`customize-pitch-btn-${audit.id}`}
                onClick={() => setShowPitchCustomizer(!showPitchCustomizer)}
                title="Customize Pitch Angles"
                className={`rounded-lg p-1.5 transition-colors ${
                  showPitchCustomizer
                    ? "bg-emerald-600 text-white"
                    : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Customizer Drawer */}
          {showPitchCustomizer && (
            <form onSubmit={handleCustomRegenerate} className="my-3 space-y-2 rounded-xl bg-stone-950 p-3 border border-stone-800">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="w-full rounded-lg border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-200 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Your Title / Agency</label>
                  <input
                    type="text"
                    value={senderCompany}
                    onChange={(e) => setSenderCompany(e.target.value)}
                    className="w-full rounded-lg border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-200 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Custom Angle / Offer Notes</label>
                <input
                  type="text"
                  value={customAngle}
                  onChange={(e) => setCustomAngle(e.target.value)}
                  placeholder="e.g. Free 1-page setup guide, guaranteed waitlist implementation in 48 hrs"
                  className="w-full rounded-lg border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-200 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPitchCustomizer(false)}
                  className="rounded-lg px-2.5 py-1 text-xs text-stone-400 hover:text-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegenerating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
                  Regenerate Pitch
                </button>
              </div>
            </form>
          )}

          {/* Probabilistic Mode Selector: A/B Testing, Follow-Up Sequence, Trust Data */}
          <div className="mt-3 flex items-center justify-between border-b border-stone-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-stone-400 font-medium mr-1">Outreach Mode:</span>
              <span className="rounded-md bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-200">
                Stage 1-4 Engine Active
              </span>
            </div>
            {audit.generatedEmail.conversionScore && (
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                🎯 {audit.generatedEmail.conversionScore.predictedReplyRate} Predicted Reply
              </span>
            )}
          </div>

          {/* A/B Testing Switcher */}
          {audit.generatedEmail.variantB && (
            <div className="mt-2.5 flex items-center gap-2 bg-stone-950/70 p-1.5 rounded-lg border border-stone-800">
              <span className="text-xs uppercase font-bold text-stone-500 px-1">A/B Test:</span>
              <button
                type="button"
                onClick={() => {
                  setActiveVariant("A");
                  setSelectedSubjectOverride(null);
                }}
                className={`flex-1 rounded py-1 px-2 text-xs font-medium transition-colors ${
                  activeVariant === "A"
                    ? "bg-emerald-600/90 text-white"
                    : "text-stone-400 hover:text-stone-200 hover:bg-stone-900"
                }`}
              >
                Variant A (Direct Pain)
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveVariant("B");
                  setSelectedSubjectOverride(null);
                }}
                className={`flex-1 rounded py-1 px-2 text-xs font-medium transition-colors ${
                  activeVariant === "B"
                    ? "bg-emerald-600/90 text-white"
                    : "text-stone-400 hover:text-stone-200 hover:bg-stone-900"
                }`}
              >
                Variant B (Observant Value)
              </button>
            </div>
          )}

          {/* Second-Order Thinking & Belief Transfer Highlight */}
          {audit.generatedEmail.hook && (
            <div className="mt-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 p-2.5 text-xs text-emerald-200/90 flex items-start gap-2">
              <span className="font-bold text-emerald-400 shrink-0">Belief Transfer:</span>
              <span className="leading-snug">{audit.generatedEmail.hook}</span>
            </div>
          )}

          {/* Subject Line Bar */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-stone-950/80 px-3.5 py-2 text-xs border border-stone-800">
            <div className="flex items-center gap-2 truncate pr-2">
              <span className="font-mono text-xs text-stone-500 uppercase shrink-0">Subject:</span>
              <span className="font-medium text-stone-200 truncate">
                {activeSubject}
              </span>
            </div>
            <button
              id={`copy-subject-${audit.id}`}
              onClick={() => handleCopySubject(activeSubject)}
              className="shrink-0 text-stone-400 hover:text-stone-100 text-xs inline-flex items-center gap-1"
            >
              {copiedSubject ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copiedSubject ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Alternative Subjects */}
          {audit.generatedEmail.alternativeSubjects && audit.generatedEmail.alternativeSubjects.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto text-xs text-stone-400 py-1">
              <span className="text-stone-500 shrink-0">Alt Subjects:</span>
              {audit.generatedEmail.alternativeSubjects.map((alt, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedSubjectOverride(alt);
                    handleCopySubject(alt);
                  }}
                  className={`rounded-md px-2 py-0.5 border text-xs truncate max-w-xs transition-colors shrink-0 ${
                    activeSubject === alt
                      ? "bg-emerald-950 border-emerald-700 text-emerald-300"
                      : "bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700 hover:text-white"
                  }`}
                >
                  &ldquo;{alt}&rdquo;
                </button>
              ))}
            </div>
          )}

          {/* Email Body */}
          <div className="relative mt-3 rounded-xl bg-stone-950 p-4 font-sans text-xs text-stone-300 leading-relaxed border border-stone-800 whitespace-pre-line">
            {isRegenerating ? (
              <div className="flex items-center justify-center py-6 gap-2 text-stone-400">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Crafting custom {TONE_LABELS[selectedTone].label} pitch with Gemini...</span>
              </div>
            ) : (
              activeBody
            )}
          </div>

          {/* Follow-up Sequence Accordion (Day 3 & Day 7) */}
          {(audit.generatedEmail.followUpDay3 || audit.generatedEmail.followUpDay7) && (
            <div className="mt-3 rounded-xl bg-stone-950/80 border border-stone-800/80 p-3">
              <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                <span className="text-xs font-semibold text-stone-300 flex items-center gap-1">
                  📅 The Follow-Up Engine (Membangun Trust)
                </span>
                <span className="text-xs text-stone-500">2-Step Sequence</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2.5">
                {audit.generatedEmail.followUpDay3 && (
                  <div className="rounded-lg bg-stone-900 p-2.5 border border-stone-800 text-stone-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-amber-400">DAY 3 (Value-Add Check-in)</span>
                      <button
                        onClick={() => handleCopySubject(`Subject: ${audit.generatedEmail!.followUpDay3!.subject}\n\n${audit.generatedEmail!.followUpDay3!.body}`)}
                        className="text-xs text-stone-400 hover:text-white flex items-center gap-0.5"
                      >
                        <Copy className="h-2.5 w-2.5" /> Copy Day 3
                      </button>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed italic">
                      &ldquo;{audit.generatedEmail.followUpDay3.body}&rdquo;
                    </p>
                  </div>
                )}
                {audit.generatedEmail.followUpDay7 && (
                  <div className="rounded-lg bg-stone-900 p-2.5 border border-stone-800 text-stone-300">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-stone-400">DAY 7 (Graceful Breakup)</span>
                      <button
                        onClick={() => handleCopySubject(`Subject: ${audit.generatedEmail!.followUpDay7!.subject}\n\n${audit.generatedEmail!.followUpDay7!.body}`)}
                        className="text-xs text-stone-400 hover:text-white flex items-center gap-0.5"
                      >
                        <Copy className="h-2.5 w-2.5" /> Copy Day 7
                      </button>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed italic">
                      &ldquo;{audit.generatedEmail.followUpDay7.body}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Target Store Contact Email & Action Buttons (Humanized Touch Layout with OSINT & Heuristic bypass) */}
          <div className="flex flex-col gap-3 mt-4 p-3.5 bg-stone-950/90 rounded-xl border border-stone-800 text-stone-100">
            <EmailInputManager
              storeUrl={audit.storeUrl || audit.cleanDomain}
              currentEmail={contactEmail}
              onUpdateEmail={setContactEmail}
              onFocus={onFocusEmailInput}
              className="mt-0 bg-stone-900 border-stone-800 text-stone-100"
            />

            {/* Action buttons separated below with generous touch targets */}
            <div className="flex flex-col sm:flex-row gap-2.5 w-full mt-1">
              <button
                type="button"
                id={`open-mailto-${audit.id}`}
                onClick={handleOpenEmailApp}
                className="flex-1 min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition-colors active:scale-[0.99]"
              >
                <Mail className="h-4 w-4" />
                Open in Email App
              </button>
              <button
                type="button"
                id={`copy-email-btn-${audit.id}`}
                onClick={handleCopyEmail}
                className="flex-1 min-h-[44px] py-2.5 px-4 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
              >
                {copiedEmail ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copiedEmail ? "Copied Full Email!" : "Copy Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



