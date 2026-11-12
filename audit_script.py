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

# Spoof authentic Chrome browser to avoid Error 403 / Bot Protection
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br'
}

def extract_shopify_inventory(store_domain):
    """
    Scrapes entire Shopify product catalog inventory using a pagination loop
    (250 products per page) until catalog is complete or access denied.
    Uses server-side filtering (fields=id,title,variants) to trim payload size by up to 96%.
    """
    all_products = []
    page = 1
    clean_domain = store_domain.strip().replace("https://", "").replace("http://", "").rstrip("/")

    while True:
        # Enforce pagination: Shopify max limit is 250 per page with server-side filtering
        target_url = f"https://{clean_domain}/products.json?limit=250&page={page}&fields=id,title,variants"
        print(f"Scraping page {page}: {target_url}")
        
        try:
            response = requests.get(target_url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"Server denied access (Code: {response.status_code}). Stopping loop.")
                break
                
            data = response.json()
            products = data.get('products', [])
            
            if not products: # Empty array means entire catalog has been extracted
                break
                
            all_products.extend(products)
            page += 1
            time.sleep(1.5) # Deterministic delay (Rate limiting)
            
        except Exception as e:
            print(f"Connection failed: {e}")
            break
            
    return all_products

def analyze_and_draft_outreach(store_domain, client=None):
    clean_domain = store_domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
    print(f"\n==================================================")
    print(f" [AUDIT] Inspecting inventory: {clean_domain}")
    print(f"==================================================")

    products = extract_shopify_inventory(clean_domain)
    if not products:
        print(f" [{clean_domain}] No products could be retrieved (possibly protected or private catalog).")
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
        print(f" Perfect inventory: 0 Out of Stock SKUs from {total_skus} total SKUs.")
        return

    sample_oos_product = sold_out_items[0]
    print(f" OOS Product Audit Proof: \"{sample_oos_product}\"")

    if not client:
        print(" Gemini client not available. Skipping email draft creation.")
        return

    # A. JSON Schema Injection (Logit Masking / response_schema)
    email_response_schema = {
        "type": "object",
        "properties": {
            "subject": {
                "type": "string",
                "description": "Engaging yet non-clickbait B2B email subject"
            },
            "body": {
                "type": "string",
                "description": "B2B email body. Do not use stiff greetings. Get straight to the point."
            }
        },
        "required": ["subject", "body"]
    }

    # B. Prompt Context Modification (No Fabricated Numbers)
    system_instruction = """You are a B2B Outreach specialist. Your job is to write a short cold email draft to an e-commerce store owner. 
Absolute Rules:
1. NEVER manipulate, guess, or mention monetary numbers, losses, or 'revenue loss'.
2. Focus on inventory FACTS: state the total SKU count and the Out of Stock (OOS) percentage.
3. Mention one specific product name currently OOS as proof of your audit.
4. Offer value: you can help them automate back-in-stock alerts.
5. Use professional, casual English, maximum 4 short sentences."""

    prompt = f"""
Store Audit Data (Actual Facts):
- Store Name: {clean_domain}
- Total Catalog: {total_skus} items
- Out of Stock Items: {oos_count} items
- Example Sold-Out Product: "{sample_oos_product}"

Draft an email based on the data above."""

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
        print(f"\n --- COLD EMAIL DRAFT FOR {clean_domain} ---")
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
        print("Note: GEMINI_API_KEY is not set. Run 'export GEMINI_API_KEY=your_key' to enable AI drafts.")

    # Example e-commerce store targets
    target_stores = [
        "beardbrand.com",
        "hiutdenim.co.uk",
    ]

    for store in target_stores:
        analyze_and_draft_outreach(store, client)



