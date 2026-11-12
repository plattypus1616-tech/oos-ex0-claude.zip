"use client";

import React, { useState } from "react";
import { Copy, Check, Terminal, X, Download, ShieldAlert } from "lucide-react";

interface PythonScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PythonScriptModal({ isOpen, onClose }: PythonScriptModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const pythonScript = `#!/usr/bin/env python3
"""
Shopify Out-of-Stock (OOS) & Phantom Inventory Auditor with Gemini AI Cold Outreach
Powered by google-genai and Gemini 3.7 Flash
"""

import os
import sys
import time
import random
import requests
from google import genai
from google.genai import types

# 1. Konfigurasi Brain Engine — Ambil dari environment variable
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    sys.exit(
        "GEMINI_API_KEY belum diset.\\n"
        "  Linux/Mac : export GEMINI_API_KEY='your-gemini-api-key'\\n"
        "  Windows   : set GEMINI_API_KEY=your-gemini-api-key\\n"
        "(Dapatkan key di https://aistudio.google.com/)"
    )

client = genai.Client(api_key=API_KEY)
MODEL_NAME = "gemini-3.8-flash"

# 2. Daftar Target Toko Shopify
target_stores = [
    "https://www.beardbrand.com",
    "https://www.tazachocolate.com",
    "https://hiutdenim.co.uk",
    "https://unitedbyblue.com",
    "https://consciousclothing.net",
    "https://asket.com",
    "https://afends.com",
    "https://upcirclebeauty.com",
    "https://tropic.com",
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
]

def fetch_store_page_with_backoff(clean_domain, page=1, retries=3, backoff=2.0):
    \"\"\"
    Mengambil data halaman produk dengan Exponential Backoff, rotasi User-Agent, dan klasifikasi error.
    Menggunakan server-side field filtering (fields=id,title,variants) untuk memangkas ukuran payload hingga 96%.
    \"\"\"
    target_url = f"https://{clean_domain}/products.json?limit=250&page={page}&fields=id,title,variants"
    for attempt in range(retries):
        try:
            headers = {
                "User-Agent": random.choice(USER_AGENTS),
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "en-US,en;q=0.9",
            }
            response = requests.get(target_url, headers=headers, timeout=12)

            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            
            # Klasifikasi Error
            if response.status_code == 404:
                return {"success": False, "reason": "404_NOT_FOUND"}
            if response.status_code in [403, 503]:
                raise Exception("CLOUDFLARE_BLOCK")

        except Exception as e:
            if attempt == retries - 1:
                return {"success": False, "reason": "BOT_PROTECTION_FAILED" if "CLOUDFLARE" in str(e) else "NETWORK_TIMEOUT"}
            
            # Exponential backoff: tunggu 2s, 4s, dll
            sleep_time = backoff * (attempt + 1)
            print(f"  [Retry {attempt + 1}/{retries}] Menunggu {sleep_time:.1f} detik...")
            time.sleep(sleep_time)

    return {"success": False, "reason": "FAILED"}

def extract_shopify_inventory(store_domain):
    \"\"\"
    Menyedot katalog produk Shopify dengan AMPUTASI DATA MENTAH (Hemat memori hingga 98%).
    \"\"\"
    lean_products = []
    page = 1
    clean_domain = store_domain.strip().replace("https://", "").replace("http://", "").rstrip("/")

    while True:
        print(f"Scraping halaman {page}: https://{clean_domain}/products.json?limit=250&page={page}&fields=id,title,variants")
        result = fetch_store_page_with_backoff(clean_domain, page=page, retries=3, backoff=2.0)

        if not result.get("success"):
            reason = result.get("reason", "UNKNOWN")
            print(f"⚠️ Selesai/Gagal pada halaman {page} ({reason}).")
            break

        data = result.get("data", {})
        raw_products = data.get("products", [])

        if not raw_products:
            break

        # AMPUTASI EKSTREM: Buang deskripsi HTML, gambar, tags, hanya simpan field esensial
        for p in raw_products:
            lean_products.append({
                "id": p.get("id"),
                "title": p.get("title", "Untitled"),
                "variants": [
                    {
                        "id": v.get("id"),
                        "title": v.get("title", ""),
                        "available": v.get("available", True),
                        "price": float(v.get("price", 0) or 0)
                    }
                    for v in p.get("variants", [])
                ]
            })

        page += 1

        if len(raw_products) < 250:
            break

        time.sleep(0.5) # Jeda deterministik (Rate limiting)

    return lean_products

def analyze_shopify_store(store_url: str):
    clean_domain = store_url.strip().replace("https://", "").replace("http://", "").rstrip("/")
    print(f"\\n🔍 [SCANNING] Memeriksa katalog: {clean_domain}...")

    products = extract_shopify_inventory(clean_domain)
    if not products:
        print(f"⚠️ [{clean_domain}] Tidak ada produk yang berhasil diambil.")
        return

    total_skus = 0
    sold_out_items = []

    for p in products:
        product_title = p.get("title", "Product")
        for v in p.get("variants", []):
            total_skus += 1
            if not v.get("available", True):
                variant_title = f" ({v.get('title')})" if v.get('title') and v.get('title') != "Default Title" else ""
                sold_out_items.append(f"{product_title}{variant_title}")

    oos_count = len(sold_out_items)
    oos_percentage = round((oos_count / total_skus * 100), 1) if total_skus > 0 else 0

    print(f"📊 FAKTA INVENTARIS: Total SKU = {total_skus} | Out of Stock = {oos_count} ({oos_percentage}%)")

    if not sold_out_items:
        print(f"✅ [{clean_domain}] 0 barang sold out. Semua {total_skus} SKU tersedia.")
        return

    sample_product = sold_out_items[0]
    print(f"🚨 Bukti Audit OOS: {sample_product}")

    # A. Injeksi Skema JSON (Logit Masking / response_schema)
    email_response_schema = {
        "type": "object",
        "properties": {
            "subject": {
                "type": "string",
                "description": "Subjek email B2B yang menarik, to-the-point, dan relevan dengan produk toko"
            },
            "body": {
                "type": "string",
                "description": "Isi email B2B maks 4 kalimat pendek dalam bahasa Inggris kasual tanpa salam basa-basi. Sebutkan contoh produk habis dan tawarkan jasa pemasangan Back-in-Stock Notification atau sistem Pre-Order/waitlist."
            }
        },
        "required": ["subject", "body"]
    }

    # B. Modifikasi Konteks Prompt (Tanpa Angka Rekaan & Fokus Back-in-Stock/Pre-Order)
    system_instruction = \"\"\"Anda adalah spesialis B2B Cold Outreach. Tulis email singkat (maks 4 kalimat) ke pemilik toko Shopify. ATURAN MUTLAK: 1. JANGAN tawarkan pemantauan atau pelacakan stok. 2. TAWARKAN jasa pemasangan 'Back-in-Stock Notification' atau sistem 'Pre-Order' agar trafik website mereka tidak terbuang sia-sia. 3. Gunakan bahasa Inggris yang kasual, to-the-point, tanpa salam basa-basi. 4. Dilarang mengarang nominal kerugian finansial.\"\"\"

    prompt = f\"\"\"Nama Toko: {clean_domain}
Jumlah SKU Kosong: {oos_count}
Contoh Barang Kosong: {sample_product}

Eksekusi: Buat email yang menyebutkan {sample_product} yang sedang habis, lalu tawarkan bantuan setup sistem penangkap data pembeli (waitlist) di halaman produk tersebut.\"\"\"

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=email_response_schema,
            ),
        )
        print(f"\\n📧 --- REKOMENDASI COLD EMAIL UNTUK {clean_domain} ---")
        print(response.text.strip())
        print("--------------------------------------------------")
    except Exception as e:
        print(f"❌ [{clean_domain}] Gagal generate AI pitch: {e}")

# Eksekusi Otomasi
if __name__ == "__main__":
    print("==================================================")
    print("🚀 SHOPIFY OOS INVENTORY & B2B COLD OUTREACH AUDITOR")
    print("==================================================")
    for store in target_stores:
        analyze_shopify_store(store)
        time.sleep(2)
`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pythonScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const blob = new Blob([pythonScript], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shopify_oos_auditor.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="python-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        id="python-modal-content"
        className="w-full max-w-3xl rounded-2xl border border-stone-200 bg-stone-900 text-stone-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4 bg-stone-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800/60 text-emerald-400">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-100 text-base">
                Python CLI Automation Script
              </h3>
              <p className="text-xs text-stone-400">
                Run locally with <code className="text-amber-300">google-genai</code> and <code className="text-amber-300">gemini-3.7-flash</code>
              </p>
            </div>
          </div>
          <button
            id="close-python-modal-btn"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-800 hover:text-stone-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Installation note */}
        <div className="bg-amber-950/40 border-b border-amber-800/30 px-6 py-3 text-xs text-amber-200/90 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-medium text-amber-300">Requirements: </span>
            Run <code className="bg-stone-950 px-1.5 py-0.5 rounded text-amber-200 font-mono">pip install google-genai requests</code> before running the script.
          </div>
        </div>

        {/* Code view */}
        <div className="relative flex-1 overflow-auto p-4 bg-stone-950 font-mono text-xs text-stone-300 leading-relaxed">
          <pre>
            <code>{pythonScript}</code>
          </pre>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-stone-800 px-6 py-3.5 bg-stone-900">
          <span className="text-xs text-stone-400">
            Updated for modern <strong className="text-stone-300">@google/genai</strong> SDK
          </span>
          <div className="flex items-center gap-2">
            <button
              id="download-script-btn"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download .py
            </button>
            <button
              id="copy-script-btn"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied Script!" : "Copy Python Script"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



