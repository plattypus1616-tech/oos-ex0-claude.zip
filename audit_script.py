#!/usr/bin/env python3
"""
Shopify Out-of-Stock (OOS) Inventory Auditor & B2B Outreach Specialist
Powered by google-genai and Gemini 3.8 Flash

Automates Shopify catalog scraping with paginated product extraction,
calculates total SKUs and OOS percentage, and drafts professional B2B cold emails.
"""

import os
import sys
import time
import requests
from google import genai
from google.genai import types

# Disguise yourself as a genuine Chrome browser to avoid Error 403 / Bot Protection
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br'
}

def extract_shopify_inventory(store_domain):
    """
    Extract the entire Shopify product catalog inventory using a pagination loop (250 products per page) until the entire catalog is extracted or access is denied.
    Using server-side filtering (fields=id,title,variants) to reduce data size by up to 96%.
    """
    all_products = []
    page = 1
    clean_domain = store_domain.strip().replace("https://", "").replace("http://", "").rstrip("/")

    while True:
        # Forced pagination: Shopify's maximum limit is 250 per page with server-side filtering.
        target_url = f"https://{clean_domain}/products.json?limit=250&page={page}&fields=id,title,variants"
        print(f"Scraping halaman {page}: {target_url}")
        
        try:
            response = requests.get(target_url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"Server menolak akses (Kode: {response.status_code}). Hentikan loop.")
                break
                
            data = response.json()
            products = data.get('products', [])
            
            if not products: # An empty array means the entire catalog has been emptied.
break
                
            all_products.extend(products)
            page += 1
            time.sleep(1.5) # Deterministic pause (Rate limiting)
            
        except Exception as e:
print(f"Connection failed: {e}")
break
            
    return all_products

def analyze_and_draft_outreach(store_domain, client=None):
    clean_domain = store_domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
    print(f"\n==================================================")
    print(f" [AUDIT] Checking inventory: {clean_domain}")
    print(f"==================================================")

    products = extract_shopify_inventory(clean_domain)
    if not products:
        print(f" [{clean_domain}] No products were retrieved successfully (maybe protected or private catalog).")
        return

    total_skus = 0
    sold_out_items = []

    for p in products:
        product_title = p.get("title", "Unknown Product")
        for v in p.get("variants", []):
            total_skus += 1
            # Shopify variant availability check
            if not v.get("available", True):
                variant_title = f" ({v.get('title')})" if v.get('title') and v.get('title') != "Default Title" else ""
                sold_out_items.append(f"{product_title}{variant_title}")

    oos_count = len(sold_out_items)
    oos_percentage = round((oos_count / total_skus * 100), 1) if total_skus > 0 else 0

    print(f" INVENTORY FACTS: Total SKUs = {total_skus} | Out of Stock (OOS) = {oos_count} ({oos_percentage}%)")

    if oos_count == 0:
        print(f"Perfect stock: 0 SKUs Out of Stock out of {total_skus} total SKUs.")
return

    sample_oos_product = sold_out_items[0]
    print(f" Bukti Audit Produk OOS: \"{sample_oos_product}\"")

    if not client:
        print("Gemini client unavailable. Skipping email drafting.")
return

    # A. Schema Injection JSON (Logit Masking / response_schema)
    email_response_schema = {
        "type": "object",
        "properties": {
            "subject": {
                "type": "string",
                "description": "B2B email subject lines that are catchy but not clickbait"
            },
            "body": {
                "type": "string",
                "description": "B2B email content. Don't use stiff greetings. Get straight to the point."
            }
        },
        "required": ["subject", "body"]
    }

    # B. Modify Prompt Context (Without Made-Up Numbers)
    system_instruction = """You're a B2B outreach specialist. Your job is to draft cold emails to e-commerce store owners. 
Absolute Rules:
1. DO NOT manipulate, guess, or mention monetary amounts, losses, or revenue losses.
2. Focus on inventory FACTS: state the total number of SKUs and the percentage that are out of stock.
3. Name one specific product that's out of stock as evidence for your audit.
4. Offer value: You can help them automate these stock alerts.
5. Use professional, relaxed English, maximum 4 short sentences."""

    prompt = f"""
Store Audit Data (Actual Facts):
- Store Name: {clean_domain}
- Total Catalog: {total_skus} items
- Number of Out-of-Stock Items: {oos_count} items
- Out of Stock Product Example: "{sample_oos_product}"

Create a draft email based on the data above."""

    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=email_response_schema,
            ),
        )
        print(f"\n --- DRAFT COLD EMAIL FOR {clean_domain} ---")
        print(response.text.strip())
        print("--------------------------------------------------\n")
    except Exception as e:
        print(f" Failed to generate AI outreach: {e}")

if __name__ == "__main__":
    api_key = os.getenv("GEMINI_API_KEY")
    client = None
    if api_key:
        client = genai.Client(api_key=api_key)
    else:
        print(" Note: GEMINI_API_KEY is not set. Run 'export GEMINI_API_KEY=your_key' to activate AI draft.")

    # Target e-commerce store example
    target_stores = [
        "beardbrand.com",
        "hiutdenim.co.uk",
    ]

    for store in target_stores:
        analyze_and_draft_outreach(store, client)