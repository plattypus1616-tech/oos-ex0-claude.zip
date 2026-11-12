"use client";

import React, { useState } from "react";
import { Download, Copy, Check, FileSpreadsheet, X, Send, Mail } from "lucide-react";
import { StoreAuditResult } from "@/lib/types";

interface EmailOutreachDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  results: StoreAuditResult[];
}

export function EmailOutreachDrawer({ isOpen, onClose, results }: EmailOutreachDrawerProps) {
  const [copiedAll, setCopiedAll] = useState(false);

  const [selectedSequenceStep, setSelectedSequenceStep] = useState<"initial" | "day3" | "day7">("initial");

  if (!isOpen) return null;

  const validLeads = results.filter(
    (r) => r.status === "success" && r.soldOutCount > 0 && r.generatedEmail
  );

  const handleExportCSV = () => {
    if (validLeads.length === 0) return;

    const headers = [
      "Store Name",
      "Website",
      "Total SKUs",
      "Sold Out Count",
      "OOS Rate (%)",
      "Top OOS Item",
      "Monthly Lost Potential",
      "Subject (Initial)",
      "Body (Initial)",
      "Variant B Subject",
      "Variant B Body",
      "Follow-Up Day 3",
      "Follow-Up Day 7",
      "Contact Email",
    ];

    const rows = validLeads.map((r) => {
      const topProduct = r.soldOutProducts[0]?.title || "Key Item";
      const escape = (str: string) => `"${(str || "").replace(/"/g, '""')}"`;

      return [
        escape(r.storeName),
        escape(r.storeUrl),
        r.totalVariantsScanned || r.totalProductsScanned,
        r.soldOutCount,
        `${r.soldOutRate}%`,
        escape(topProduct),
        escape(r.generatedEmail?.estimatedMonthlyBurn || ""),
        escape(r.generatedEmail?.subject || ""),
        escape(r.generatedEmail?.body || ""),
        escape(r.generatedEmail?.variantB?.subject || ""),
        escape(r.generatedEmail?.variantB?.body || ""),
        escape(r.generatedEmail?.followUpDay3?.body || ""),
        escape(r.generatedEmail?.followUpDay7?.body || ""),
        escape(r.contactEmail || ""),
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shopify_consultative_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenLeadEmail = (lead: StoreAuditResult) => {
    const targetEmail = lead.contactEmail?.trim();
    if (!targetEmail) {
      alert("Failed: Store email not detected from scraping. Please search manually on the client's website.");
      return;
    }
    if (!lead.generatedEmail) return;

    let subject = lead.generatedEmail.subject;
    let body = lead.generatedEmail.body;

    if (selectedSequenceStep === "day3" && lead.generatedEmail.followUpDay3) {
      subject = lead.generatedEmail.followUpDay3.subject;
      body = lead.generatedEmail.followUpDay3.body;
    } else if (selectedSequenceStep === "day7" && lead.generatedEmail.followUpDay7) {
      subject = lead.generatedEmail.followUpDay7.subject;
      body = lead.generatedEmail.followUpDay7.body;
    }

    window.location.assign(`mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleCopyAll = async () => {
    if (validLeads.length === 0) return;

    const combinedText = validLeads
      .map(
        (r, idx) =>
          `=== LEAD #${idx + 1}: ${r.storeName} (${r.storeUrl}) ===\n` +
          `Inventory Facts: ${r.soldOutCount} of ${r.totalVariantsScanned} SKUs Out of Stock (${r.soldOutRate}%)\n` +
          `Key OOS Item: ${r.soldOutProducts[0]?.title || "Key Product"}\n` +
          `Belief Transfer: ${r.generatedEmail?.hook || "N/A"}\n\n` +
          `[STEP 1 - INITIAL OUTREACH]\nSUBJECT: ${r.generatedEmail?.subject}\n${r.generatedEmail?.body}\n\n` +
          (r.generatedEmail?.followUpDay3 ? `[STEP 2 - DAY 3 FOLLOW-UP]\n${r.generatedEmail.followUpDay3.body}\n\n` : "") +
          (r.generatedEmail?.followUpDay7 ? `[STEP 3 - DAY 7 BREAKUP]\n${r.generatedEmail.followUpDay7.body}\n\n` : "") +
          `------------------------------------------------------------`
      )
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(combinedText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {}
  };

  return (
    <div
      id="outreach-drawer-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="outreach-drawer-content"
        className="w-full max-w-4xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-800 dark:bg-stone-900 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100 text-base">
                Outreach Campaign Center ({validLeads.length} Hot Leads)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Ready-to-send AI pitches for stores with verified stockouts
              </p>
            </div>
          </div>
          <button
            id="close-outreach-drawer-btn"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sequence Filter Tabs */}
        <div className="flex items-center gap-2 px-1 pb-2 border-b border-stone-100 dark:border-stone-800">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Sequence Step:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedSequenceStep("initial")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedSequenceStep === "initial"
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
              }`}
            >
              Step 1: Initial Pitch
            </button>
            <button
              onClick={() => setSelectedSequenceStep("day3")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedSequenceStep === "day3"
                  ? "bg-amber-600 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
              }`}
            >
              Step 2: Day 3 Follow-Up
            </button>
            <button
              onClick={() => setSelectedSequenceStep("day7")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedSequenceStep === "day7"
                  ? "bg-stone-700 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
              }`}
            >
              Step 3: Day 7 Breakup
            </button>
          </div>
        </div>

        {/* Lead List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {validLeads.length === 0 ? (
            <div className="py-12 text-center text-stone-500">
              <p className="text-sm font-medium">No active OOS leads generated yet.</p>
              <p className="text-xs mt-1">Audit Shopify stores to find sold out items and draft pitches.</p>
            </div>
          ) : (
            validLeads.map((lead) => {
              const currentSubject =
                selectedSequenceStep === "day3" && lead.generatedEmail?.followUpDay3
                  ? lead.generatedEmail.followUpDay3.subject
                  : selectedSequenceStep === "day7" && lead.generatedEmail?.followUpDay7
                  ? lead.generatedEmail.followUpDay7.subject
                  : lead.generatedEmail?.subject;

              const currentBody =
                selectedSequenceStep === "day3" && lead.generatedEmail?.followUpDay3
                  ? lead.generatedEmail.followUpDay3.body
                  : selectedSequenceStep === "day7" && lead.generatedEmail?.followUpDay7
                  ? lead.generatedEmail.followUpDay7.body
                  : lead.generatedEmail?.body;

              return (
                <div
                  key={lead.id}
                  className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 text-xs dark:border-stone-800 dark:bg-stone-950/50"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200/60 dark:border-stone-800">
                    <div className="flex items-center gap-2">
                      <strong className="text-stone-900 dark:text-stone-100 text-sm font-semibold">
                        {lead.storeName}
                      </strong>
                      <span className="text-stone-500">({lead.cleanDomain})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {lead.generatedEmail?.conversionScore && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                          {lead.generatedEmail.conversionScore.predictedReplyRate}
                        </span>
                      )}
                      <span className="font-semibold text-rose-700 dark:text-rose-400">
                        {lead.soldOutCount} of {lead.totalVariantsScanned} SKUs OOS ({lead.soldOutRate}%)
                      </span>
                    </div>
                  </div>

                  {lead.generatedEmail?.hook && selectedSequenceStep === "initial" && (
                    <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 p-2 rounded-md border border-emerald-200/60 dark:border-emerald-900/40">
                      <strong>Belief Transfer:</strong> {lead.generatedEmail.hook}
                    </div>
                  )}

                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-stone-500 uppercase text-xs">Subject:</span>
                      <span className="font-medium text-stone-800 dark:text-stone-200">
                        {currentSubject}
                      </span>
                    </div>
                    <p className="text-stone-600 dark:text-stone-300 font-sans whitespace-pre-line leading-relaxed pl-2 border-l-2 border-emerald-500/40">
                      {currentBody}
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-stone-200/50 dark:border-stone-800">
                      <span className="text-xs text-stone-500">
                        Email: {lead.contactEmail || <span className="italic text-amber-500">Not detected</span>}
                      </span>
                      <button
                        onClick={() => handleOpenLeadEmail(lead)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                      >
                        <Mail className="h-3 w-3" />
                        Open in Email App
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-stone-100 dark:border-stone-800">
          <span className="text-xs text-stone-500">
            Export for tools like Instantly, Smartlead, Lemlist or Apollo
          </span>
          <div className="flex items-center gap-2">
            <button
              id="copy-all-leads-btn"
              onClick={handleCopyAll}
              disabled={validLeads.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors"
            >
              {copiedAll ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedAll ? "Copied All Leads!" : "Copy All Formatted"}
            </button>
            <button
              id="export-csv-btn"
              onClick={handleExportCSV}
              disabled={validLeads.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export CSV Leads
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



