import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/gemini";
import { Type } from "@google/genai";
import { GeneratedColdEmail, ShopifyProduct, SoldOutItem, StoreAuditResult } from "@/lib/types";
import { DEFAULT_STORES } from "@/lib/presets";
import { safeFetch, parseStoreUrl } from "@/lib/safe-fetch";
import { guard, clip } from "@/lib/guards";
import { pickContact } from "@/lib/contacts";

function formatUrl(rawUrl: string): { fullUrl: string; cleanDomain: string; storeName: string } {
  let url = rawUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, "");

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    const storeName = parts.length > 1 && parts[0] !== "myshopify" 
      ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
      : hostname;

    return {
      fullUrl: `${parsed.protocol}//${parsed.host}`,
      cleanDomain: hostname,
      storeName,
    };
  } catch {
    return {
      fullUrl: url,
      cleanDomain: url.replace(/^https?:\/\//, "").replace(/^www\./, ""),
      storeName: "E-Commerce Store",
    };
  }
}

async function generateAIPitch(
  storeName: string,
  domain: string,
  soldOutItems: SoldOutItem[],
  totalVariants: number,
  soldOutRate: number,
  tone: string = "sharp_3_sentence"
): Promise<GeneratedColdEmail> {
  const sampleItem = soldOutItems[0]?.title 
    ? `${soldOutItems[0].title}${soldOutItems[0].variantTitle ? ` (${soldOutItems[0].variantTitle})` : ""}`
    : "Featured Item";

  const store = {
    name: storeName,
    totalProducts: totalVariants,
    outOfStockCount: soldOutItems.length,
    sampleOosItemName: sampleItem,
  };

  const emailResponseSchema = {
    type: Type.OBJECT,
    properties: {
      subject: { 
        type: Type.STRING, 
        description: "Subjek email B2B yang menarik, to-the-point, dan relevan dengan produk toko" 
      },
      body: { 
        type: Type.STRING, 
        description: "Isi email B2B maks 4 kalimat pendek dalam bahasa Inggris kasual tanpa salam basa-basi. Sebutkan contoh produk habis dan tawarkan jasa pemasangan Back-in-Stock Notification atau sistem Pre-Order/waitlist." 
      }
    },
    required: ["subject", "body"]
  };

  const systemInstruction = `Anda adalah spesialis B2B Cold Outreach. Tulis email singkat (maks 4 kalimat) ke pemilik toko Shopify. ATURAN MUTLAK: 1. JANGAN tawarkan pemantauan atau pelacakan stok. 2. TAWARKAN jasa pemasangan 'Back-in-Stock Notification' atau sistem 'Pre-Order' agar trafik website mereka tidak terbuang sia-sia. 3. Gunakan bahasa Inggris yang kasual, to-the-point, tanpa salam basa-basi. 4. Dilarang mengarang nominal kerugian finansial.`;

  const prompt = `Nama Toko: ${store.name}
Jumlah SKU Kosong: ${store.outOfStockCount}
Contoh Barang Kosong: ${store.sampleOosItemName}

Eksekusi: Buat email yang menyebutkan ${store.sampleOosItemName} yang sedang habis, lalu tawarkan bantuan setup sistem penangkap data pembeli (waitlist) di halaman produk tersebut.`;

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: emailResponseSchema,
      },
    });

    const text = response.text || "{}";
    const parsed = JSON.parse(text.trim());
    return {
      subject: parsed.subject || `Quick question about ${sampleItem} on ${storeName}`,
      alternativeSubjects: [
        `Back-in-stock waitlist for ${storeName}`,
        `Capturing demand for out-of-stock items on ${storeName}`,
        `Quick idea for ${sampleItem} on ${storeName}`,
      ],
      body: parsed.body || `Hey ${storeName} team,\n\nI was browsing your store and noticed "${sampleItem}" is currently out of stock.\n\nInstead of losing shoppers who land on that sold-out page, I can help you set up a simple Back-in-Stock alert or pre-order waitlist to capture their emails.\n\nOpen to having me set this up for you this week so you don't lose that high-intent traffic?`,
      hook: `Noticed "${sampleItem}" is out of stock—ready to capture interested shoppers with a waitlist?`,
      callToAction: "Would you be open to a quick setup of a back-in-stock waitlist for your out-of-stock items?",
      tone: tone,
      keyLossHighlight: `${soldOutItems.length} OOS items (${soldOutRate}%) where high-intent visitor traffic can be converted into waitlist leads`,
      estimatedMonthlyBurn: `${soldOutItems.length} high-demand products currently leaking visitors`,
    };
  } catch (err) {
    console.error("Gemini pitch generation error:", err);
    return {
      subject: `Quick question about ${sampleItem} on ${storeName}`,
      alternativeSubjects: [
        `Back-in-stock waitlist for ${storeName}`,
        `Capturing demand for out-of-stock items on ${storeName}`,
        `Quick idea for ${sampleItem} on ${storeName}`,
      ],
      body: `Hey ${storeName} team,\n\nI was browsing your store and noticed "${sampleItem}" is currently out of stock.\n\nInstead of losing shoppers who land on that sold-out page, I can help you set up a simple Back-in-Stock alert or pre-order waitlist to capture their emails.\n\nOpen to having me set this up for you this week so you don't lose that high-intent traffic?`,
      hook: `Noticed "${sampleItem}" is out of stock—ready to capture interested shoppers with a waitlist?`,
      callToAction: "Would you be open to a quick setup of a back-in-stock waitlist for your out-of-stock items?",
      tone,
      keyLossHighlight: `${soldOutItems.length} OOS items (${soldOutRate}%) ready for waitlist recovery`,
      estimatedMonthlyBurn: `${soldOutItems.length} high-demand products currently leaking visitors`,
    };
  }
}

// User-Agent rotation pool for anti-blocking resiliency
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

// Lean product representation after extreme amputation (98% reduction in memory)
interface LeanProduct {
  id: number | string;
  title: string;
  handle: string;
  primaryImage: string;
  productType: string;
  vendor: string;
  variants: {
    id: number | string;
    title: string;
    price: number;
    available: boolean;
  }[];
}

interface FetchStoreResult {
  success: boolean;
  data?: { products: LeanProduct[]; rawProductCount: number };
  reason?: "404_NOT_FOUND" | "BOT_PROTECTION_FAILED" | "NETWORK_TIMEOUT" | "SERVER_ERROR";
  status?: number;
  errorMessage?: string;
  isCloudflare?: boolean;
}

/**
 * Fetch Shopify catalog data with Exponential Backoff, User-Agent Rotation, and Immediate Data Amputation
 */
async function fetchStoreData(
  storeUrl: string,
  page: number = 1,
  retries: number = 3,
  backoff: number = 2000
): Promise<FetchStoreResult> {
  for (let i = 0; i < retries; i++) {
    try {
      // Rotasi User Agent
      const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      // Server-side filtering: Amputasi data mentah langsung di server Shopify (tanpa body_html / deskripsi berat)
      const targetUrl = `${storeUrl}/products.json?limit=250&page=${page}&fields=id,title,variants,handle,images`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await safeFetch(targetUrl, {
        headers: {
          "User-Agent": randomUA,
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: controller.signal,
        next: { revalidate: 0 },
      });
      clearTimeout(timeoutId);

      if (response.status === 200) {
        const rawJson = await response.json();
        const rawProducts = Array.isArray(rawJson?.products) ? rawJson.products : [];

        // AMPUTASI EKSTREM: Buang body_html, deskripsi panjang, tags, options, dan metadata berlebih
        const leanProducts: LeanProduct[] = rawProducts.map((p: any) => ({
          id: p.id,
          title: p.title || "Untitled Product",
          handle: p.handle || "",
          primaryImage: p.images?.[0]?.src || p.image?.src || "",
          productType: p.product_type || "General",
          vendor: p.vendor || "",
          variants: (p.variants || []).map((v: any) => ({
            id: v.id,
            title: v.title === "Default Title" ? "" : (v.title || ""),
            price: parseFloat(v.price) || 0,
            available: v.available !== false,
          })),
        }));

        return {
          success: true,
          data: { products: leanProducts, rawProductCount: rawProducts.length },
        };
      }

      // Klasifikasi Error
      if (response.status === 404) {
        return {
          success: false,
          reason: "404_NOT_FOUND",
          status: 404,
          errorMessage: "404 Not Found: /products.json endpoint is not available or disabled on this store.",
        };
      }

      const isCloudflare =
        response.status === 403 ||
        response.status === 503 ||
        response.headers.get("cf-ray") !== null ||
        response.headers.get("server")?.toLowerCase().includes("cloudflare");

      if (isCloudflare) {
        throw new Error("CLOUDFLARE_BLOCK"); // Lempar ke blok catch untuk retry dengan exponential backoff
      }

      if (response.status >= 500) {
        throw new Error(`SERVER_ERROR_${response.status}`);
      }

      return {
        success: false,
        reason: "SERVER_ERROR",
        status: response.status,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error: unknown) {
      const isLastAttempt = i === retries - 1;
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        if (errorMsg === "CLOUDFLARE_BLOCK") {
          return {
            success: false,
            reason: "BOT_PROTECTION_FAILED",
            status: 403,
            isCloudflare: true,
            errorMessage: "Cloudflare / Bot Protection (HTTP 403/503) active after retries.",
          };
        }
        return {
          success: false,
          reason: errorMsg.includes("abort") ? "NETWORK_TIMEOUT" : "SERVER_ERROR",
          errorMessage: errorMsg,
        };
      }

      // Exponential Backoff: Tunggu 2s, 4s, lalu coba lagi
      await new Promise((res) => setTimeout(res, backoff * (i + 1)));
    }
  }

  return {
    success: false,
    reason: "BOT_PROTECTION_FAILED",
    status: 403,
    isCloudflare: true,
    errorMessage: "Bot protection triggered after multiple retries.",
  };
}

export async function POST(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { url, autoGenerateEmail = true, tone = "sharp_3_sentence" } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid store URL is required." },
        { status: 400 }
      );
    }

    let normalized: string;
    try { normalized = parseStoreUrl(clip(url, 253).replace(/^http:\/\//i, "https://")).href; }
    catch (e) { return NextResponse.json({ error: `URL ditolak: ${(e as Error).message}` }, { status: 400 }); }
    const { fullUrl, cleanDomain, storeName } = formatUrl(normalized);

    // Paginasi paksa: batas maksimum Shopify adalah 250 per halaman
    const allProducts: LeanProduct[] = [];
    let page = 1;
    const maxPages = 10; // Mendukung katalog hingga 2,500 produk secara andal
    let hasError = false;
    let errorReason: FetchStoreResult["reason"] | undefined;
    let errorMsg = "";
    let isCloudflare = false;

    while (page <= maxPages) {
      const pageResult = await fetchStoreData(fullUrl, page, 3, 1500);

      if (!pageResult.success) {
        if (page === 1) {
          hasError = true;
          errorReason = pageResult.reason;
          errorMsg = pageResult.errorMessage || "Failed to retrieve store catalog";
          isCloudflare = Boolean(pageResult.isCloudflare || pageResult.reason === "BOT_PROTECTION_FAILED");
        }
        // Hentikan pagination jika ada error
        break;
      }

      const products: LeanProduct[] = pageResult.data?.products || [];

      if (!products || products.length === 0) {
        // Array kosong berarti seluruh katalog sudah disedot
        break;
      }

      allProducts.push(...products);
      page++;

      // Jika produk yang dikembalikan kurang dari 250, ini adalah halaman terakhir
      if (products.length < 250) {
        break;
      }

      // Jeda deterministik (Rate limiting)
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    if (hasError && allProducts.length === 0) {
      let diagnosticNote = `Endpoint error: ${errorMsg}`;
      if (errorReason === "404_NOT_FOUND") {
        diagnosticNote = "404 Not Found: /products.json endpoint is not available or disabled on this store.";
      } else if (errorReason === "BOT_PROTECTION_FAILED" || isCloudflare) {
        diagnosticNote = "This Shopify store is actively behind Cloudflare / Bot Protection (HTTP 403/503), preventing direct anonymous scraping of /products.json.";
      } else if (errorReason === "NETWORK_TIMEOUT") {
        diagnosticNote = "Request timeout: Store took too long to respond across multiple retry attempts.";
      }

      return NextResponse.json({
        result: {
          id: cleanDomain,
          storeUrl: fullUrl,
          cleanDomain,
          storeName,
          status: isCloudflare || errorReason === "BOT_PROTECTION_FAILED" ? "protected" : "error",
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
          errorMessage: errorMsg || (isCloudflare ? "Cloudflare / Bot Protection" : "Failed to fetch products"),
          diagnosticNote,
          auditTimestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        } satisfies StoreAuditResult,
      });
    }

    const soldOutItems: SoldOutItem[] = [];
    let totalVariants = 0;
    let availableCount = 0;

    for (const p of allProducts) {
      let productHasOOS = false;

      for (const v of p.variants || []) {
        totalVariants++;
        const isAvailable = v.available !== false;

        if (!isAvailable) {
          productHasOOS = true;
          const numericPrice = v.price || 0;
          soldOutItems.push({
            id: `${p.id}_${v.id}`,
            title: p.title,
            variantTitle: v.title === "Default Title" ? "" : v.title,
            price: numericPrice,
            priceFormatted: `$${numericPrice.toFixed(2)}`,
            currency: "USD",
            handle: p.handle,
            productUrl: `${fullUrl}/products/${p.handle}`,
            imageUrl: p.primaryImage,
            productType: p.productType || "General",
            vendor: p.vendor || storeName,
          });
        }
      }

      if (!productHasOOS) {
        availableCount++;
      }
    }

    // Sort sold out items by price (highest ticket items first)
    soldOutItems.sort((a, b) => b.price - a.price);

    const soldOutCount = soldOutItems.length;
    const soldOutRate =
      totalVariants > 0
        ? Math.round((soldOutCount / totalVariants) * 1000) / 10
        : 0;

    // Hanya fakta terukur (jumlah/persentase). Tidak ada estimasi nominal kerugian.
    const topOOSProducts = soldOutItems.slice(0, 8);

    // Attempt to scrape live contact email from store pages or fallback to preset
    let detectedEmail = "";
    try {
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
      const invalidEmailFilters = [
        "sentry", "shopify", "wixpress", "cloudflare", "example.com", "schema.org", 
        "domain.com", "email.com", "test.com", "youremail", "username", ".png", ".jpg", ".webp", ".svg"
      ];

      // Quick fetch of homepage with 3s timeout
      const pageController = new AbortController();
      const pageTimeout = setTimeout(() => pageController.abort(), 3500);
      const homeRes = await safeFetch(fullUrl, {
        headers: {
          "User-Agent": USER_AGENTS[0],
          Accept: "text/html,application/xhtml+xml",
        },
        signal: pageController.signal,
        next: { revalidate: 0 },
      }).catch(() => null);
      clearTimeout(pageTimeout);

      if (homeRes && homeRes.ok) {
        const html = await homeRes.text();
        const matches = html.match(emailRegex) || [];
        detectedEmail = pickContact(matches, cleanDomain).email;
      }
    } catch {
      // Ignore scraping error, fallback safely
    }

    // Attempt to resolve from preset if scraping did not find an email
    if (!detectedEmail) {
      const matchedPreset = DEFAULT_STORES.find(
        (s) => s.url.includes(cleanDomain) || cleanDomain.includes(s.name.toLowerCase().replace(/\s+/g, ""))
      );
      if (matchedPreset?.contactEmail) {
        detectedEmail = matchedPreset.contactEmail;
      }
    }

    let generatedEmail: GeneratedColdEmail | undefined;
    if (autoGenerateEmail && soldOutItems.length > 0) {
      generatedEmail = await generateAIPitch(
        storeName,
        cleanDomain,
        soldOutItems,
        totalVariants,
        soldOutRate,
        tone
      );
    }

    // Simpan maksimal 50 produk sold out ke state/storage untuk menghemat kuota memori
    const leanSoldOutItems = soldOutItems.slice(0, 50);

    const auditResult: StoreAuditResult = {
      id: cleanDomain,
      storeUrl: fullUrl,
      cleanDomain,
      storeName,
      status: soldOutCount > 0 ? "success" : "no_oos",
      totalProductsScanned: allProducts.length,
      totalVariantsScanned: totalVariants,
      soldOutCount,
      soldOutRate,
      soldOutProducts: leanSoldOutItems,
      availableProductsCount: availableCount,
      topOOSProducts,
      currency: "USD",
      contactEmail: detectedEmail,
      generatedEmail,
      auditTimestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      diagnosticNote:
        soldOutCount > 0
          ? `Audited ${allProducts.length} products (${totalVariants} total SKUs): ${soldOutCount} Out of Stock (${soldOutRate}% OOS).`
          : `Scanned ${allProducts.length} products (${totalVariants} total SKUs) — 100% available in stock.`,
    };

    return NextResponse.json({ result: auditResult });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: "Audit processing failed.", details: errorMsg },
      { status: 500 }
    );
  }
}



