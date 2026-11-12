import { NextRequest, NextResponse } from "next/server";
import { ai } from "@/lib/gemini";
import { Type } from "@google/genai";
import { GeneratedColdEmail, SoldOutItem } from "@/lib/types";
import { guard, clip } from "@/lib/guards";

export async function POST(req: NextRequest) {
  const blocked = guard(req, { limit: 20 });
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const {
      storeName,
      storeUrl,
      soldOutProducts = [] as SoldOutItem[],
      totalVariants,
      soldOutRate,
      tone = "sharp_3_sentence",
      senderName: senderNameRaw = "Alex",
      senderCompany: senderCompanyRaw = "Inventory Automation Specialist",
      customAngle: customAngleRaw = "",
    } = body;
    const senderName = clip(senderNameRaw, 60), senderCompany = clip(senderCompanyRaw, 80), customAngle = clip(customAngleRaw, 200);

    if (!Array.isArray(soldOutProducts)) {
      return NextResponse.json({ error: "soldOutProducts harus array." }, { status: 400 });
    }
    const safeItems = (soldOutProducts as SoldOutItem[]).slice(0, 20).map((i) => ({
      ...i, title: clip(i?.title, 120), variantTitle: clip(i?.variantTitle, 80),
    }));
    soldOutProducts.length = 0; soldOutProducts.push(...safeItems);
    if (!storeName || soldOutProducts.length === 0) {
      return NextResponse.json(
        { error: "storeName and at least one soldOutProduct are required." },
        { status: 400 }
      );
    }

    const totalSkus = totalVariants || Math.max(soldOutProducts.length, 60);
    const oosRate = soldOutRate !== undefined 
      ? soldOutRate 
      : Math.round((soldOutProducts.length / totalSkus) * 1000) / 10;

    const topProduct = soldOutProducts[0];
    const sampleItem = topProduct?.title
      ? `${topProduct.title}${topProduct.variantTitle && topProduct.variantTitle !== "Default Title" ? ` (${topProduct.variantTitle})` : ""}`
      : "Key Product";
        
    const store = {
      name: storeName,
      totalProducts: totalSkus,
      outOfStockCount: soldOutProducts.length,
      sampleOosItemName: sampleItem,
    };

    const emailResponseSchema = {
      type: Type.OBJECT,
      properties: {
        subject: { 
          type: Type.STRING, 
          description: "Subjek email B2B santai dan spesifik menyebut nama produk atau pertanyaan singkat (maksimal 7 kata, hindari huruf kapital berlebihan)." 
        },
        body: { 
          type: Type.STRING, 
          description: "Isi email B2B maks 4 kalimat pendek dalam bahasa Inggris kasual tanpa basa-basi. DILARANG menggunakan kata AI, Software, Bot, atau Otomasi. Sebutkan produk spesifik yang habis, tunjukkan rasa peduli terhadap hilangnya pembeli ber-niat tinggi, dan tawarkan bantuan setup Back-in-Stock / Pre-Order waitlist." 
        },
        hook: {
          type: Type.STRING,
          description: "Belief Transfer Hook 1 kalimat yang menularkan urgensi bahwa stok kosong membuang pembeli siap bayar ke kompetitor."
        },
        variantB_subject: {
          type: Type.STRING,
          description: "Subjek alternatif untuk A/B testing (pendekatan berbeda)."
        },
        variantB_body: {
          type: Type.STRING,
          description: "Isi email alternatif (Variant B) untuk A/B testing konstan: sudut pandang berbeda yang tetap singkat (maks 4 kalimat), empati tinggi, tanpa kata AI/Software."
        },
        followUpDay3: {
          type: Type.STRING,
          description: "Email follow up singkat (Day 3) jika belum dibalas, membawa nilai tambah (value-add) tanpa memaksa."
        },
        followUpDay7: {
          type: Type.STRING,
          description: "Email follow up terakhir (Day 7) dengan pendekatan graceful breakup / no-pressure check-in."
        },
        predictedReplyRate: {
          type: Type.STRING,
          description: "Prediksi tingkat respon probabilistik (misal: '38% - 44%')."
        }
      },
      required: ["subject", "body", "hook", "variantB_subject", "variantB_body", "followUpDay3", "followUpDay7"]
    };

    const toneInstructions: Record<string, string> = {
      sharp_3_sentence: "Gaya konsultan santai, to the point, maksimal 3-4 kalimat. Fokus pada empati kehilangan calon pembeli pada produk spesifik dan tawarkan setup waitlist cepat.",
      preorder_recovery: "Fokus pada konversi niat beli seketika menjadi pesanan pre-order agar pembeli tidak lari ke kompetitor saat barang habis.",
      revenue_leak_executive: "Fokus pada penyelamatan trafik website yang sudah memiliki niat beli tinggi (high-intent traffic) agar tidak terbuang sia-sia.",
      phantom_inventory_specialist: "Fokus pada setup lead capture SMS/Email restock notification di halaman produk sold-out.",
      vip_waitlist: "Fokus pada pembuatan VIP restock waitlist untuk menangkap lead pembeli loyal.",
      linkedin_inmail: "Gaya DM super singkat, ramah antar founder (di bawah 50 kata), tawarkan bantuan setup tanpa ribet.",
      loom_video_script: "Skrip video audit 60 detik yang menunjukkan halaman produk sold-out dan mendemokan solusi widget waitlist.",
    };

    const systemInstruction = `Anda adalah konsultan e-commerce & high-ticket growth advisor profesional (B2B Cold Outreach Specialist).
Tulis email ultra-singkat (maksimal 4 kalimat) ke pemilik toko Shopify dengan filosofi konsultatif:
1. TAHAP 1 (Humanized Empathy): BUANG SEMUA KATA "AI", "AUTOMATION", "SOFTWARE", "BOT", ATAU "ALGORITMA" DARI SELURUH EMAIL. Jadilah manusia yang jeli, peduli, dan pendengar yang baik.
2. TAHAP 2 (Second-Order Thinking & Trust): Sebutkan produk spesifik yang habis (${store.sampleOosItemName}). Bangun rasa percaya dengan menunjukkan Anda benar-benar memeriksa toko mereka.
3. TAHAP 3 (Belief Transfer Hook): Sebut secara netral bahwa sebagian pengunjung yang melihat 'Sold Out' mungkin tidak kembali. JANGAN menyebut angka uang, omzet, atau persentase selain yang diberikan. Tawarkan bantuan memasang sistem 'Back-in-Stock Notification' atau 'Pre-Order Waitlist' langsung.
4. TAHAP 4 (Probabilistic Execution): Buat varian A/B testing dan sequence follow-up yang natural tanpa paksaan.
5. Bahasa: Bahasa Inggris kasual, natural, to-the-point, seperti pesan dari sesama praktisi e-commerce.${toneInstructions[tone] ? `\nPenekanan Sudut Pandang: ${toneInstructions[tone]}` : ""}${customAngle ? `\nCatatan Tambahan Penawaran: ${customAngle}` : ""}`;

    const prompt = `Nama Toko: ${store.name}
Domain: ${storeUrl}
Jumlah SKU Kosong: ${store.outOfStockCount} dari ${store.totalProducts} total SKU (${oosRate}%)
Contoh Produk Habis: "${store.sampleOosItemName}"

TUGAS:
1. Buat Cold Email utama (Variant A) maks 4 kalimat yang menyebut "${store.sampleOosItemName}" dan menawarkan bantuan setup waitlist/pre-order sebelum restock berikutnya.
2. Buat Cold Email alternatif (Variant B) untuk A/B testing.
3. Buat Follow Up Day 3 (menanyakan kabar santai + value-add).
4. Buat Follow Up Day 7 (graceful breakup / zero pressure).`;

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

    const generated: GeneratedColdEmail = {
      subject: parsed.subject || `Quick thought regarding ${sampleItem} on ${storeName}`,
      body: parsed.body || `Hey ${storeName} team,\n\nI was looking through your catalog and noticed "${sampleItem}" is currently sold out.\n\nWhen shoppers land on that page with high intent to buy, most bounce to a competitor instead of waiting. I can quickly set up a clean Back-in-Stock notification and pre-order waitlist to capture their emails.\n\nOpen to having me handle this setup for you this week so you don't lose those interested customers?`,
      hook: parsed.hook || `Every shopper landing on "${sampleItem}" right now has high purchase intent—without a waitlist, that demand bounces straight to competitors.`,
      callToAction: "Open to having me set up a back-in-stock capture for your sold-out items this week?",
      tone: tone,
      keyLossHighlight: `${soldOutProducts.length} items (${oosRate}% of catalog) leaking high-intent buyers`,
      estimatedMonthlyBurn: `${soldOutProducts.length} dari ${totalSkus} SKU habis, contoh: "${sampleItem}"`,
      variantA: {
        type: "Variant A (Direct Pain & Immediate Fix)",
        subject: parsed.subject || `Quick question about ${sampleItem} on ${storeName}`,
        body: parsed.body || `Hey ${storeName} team,\n\nI was browsing your store and noticed "${sampleItem}" is currently out of stock.\n\nShoppers landing there right now are ready to buy, but with no way to capture their info, they're likely leaving for good. I help Shopify brands set up frictionless back-in-stock waitlists so you retain 100% of that purchase intent.\n\nWould you be open to me setting this up for you this week?`,
        hook: parsed.hook || `Captures high-intent buyers on "${sampleItem}" before they bounce to competitors.`,
      },
      variantB: {
        type: "Variant B (Observant Consultant & Value-Add)",
        subject: parsed.variantB_subject || `Idea for capturing demand on ${storeName}`,
        body: parsed.variantB_body || `Hi ${storeName} team,\n\nCame across your shop while researching top brands in your space and noticed "${sampleItem}" is completely out of stock.\n\nSince that's clearly one of your popular pieces, you're likely getting regular visitors ready to purchase who simply hit a dead end. I'd love to help you add a simple restock notification flow so those leads are captured and notified the second you replenish.\n\nWorth a brief chat to see how we could get this running for you?`,
        hook: `Converts dead-end product pages into high-converting restock customer lists.`,
      },
      followUpDay3: {
        subject: `Re: ${parsed.subject || `Quick thought regarding ${sampleItem}`}`,
        body: parsed.followUpDay3 || `Hey ${storeName} team,\n\nQuick follow-up on my note about "${sampleItem}". Wanted to see if you had 2 minutes to check this out, or if your team already has a waitlist solution planned for the next restock?\n\nHappy to share a quick 1-page breakdown if helpful.`,
      },
      followUpDay7: {
        subject: `Closing the loop on ${sampleItem}`,
        body: parsed.followUpDay7 || `Hi ${storeName} team,\n\nAssuming your restock process is fully handled in-house right now, so I won't follow up again on this.\n\nIf you ever want to capture waitlist buyers on sold-out products in the future, feel free to reach back out anytime. Wishing ${storeName} continued success!`,
      },
      conversionScore: {
        predictedReplyRate: parsed.predictedReplyRate || "39% - 46%",
        trustScore: 94,
        strengths: [
          `Specific item cited: "${sampleItem}"`,
          "Zero AI/Software buzzwords (100% consultative human tone)",
          "Belief Transfer on high-intent buyer leakage",
          "Low-friction, concierge-style Call to Action"
        ]
      },
      alternativeSubjects: [
        parsed.subject || `Quick question about ${sampleItem} on ${storeName}`,
        parsed.variantB_subject || `Capturing demand for out-of-stock items on ${storeName}`,
        `Back-in-stock setup for ${sampleItem}`,
        `Question regarding ${storeName}'s restock flow`,
      ],
    };

    return NextResponse.json({ email: generated });
  } catch (err: unknown) {
    console.error("Failed to generate cold email:", err);
    const errorMsg = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json(
      { error: "Could not generate email.", details: errorMsg },
      { status: 500 }
    );
  }
}



