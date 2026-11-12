"""Email drafts (Gemini free tier) + hallucinated numbers validator. API/validation failure -> fact-based template."""
import os, re
from . import config

SYSTEM = """You write short B2B cold emails to Shopify store owners.
Hard rules:
1. NEVER mention or guess money, revenue, losses, or any number other than the ones given.
2. State the total SKU count and the out-of-stock count/percentage exactly as given.
3. Name the one example sold-out product exactly as given.
4. Offer to set up back-in-stock / waitlist alerts. Plain, professional English, max 4 short sentences.
5. No greeting fluff, no claims about their business beyond the given facts."""

SCHEMA = {"type": "object", "properties": {"subject": {"type": "string"}, "body": {"type": "string"}},
          "required": ["subject", "body"]}

def body_ok(body, n, k, sample):
    pct = round(100 * k / n, 1)
    if re.search(r"[$€£]|\b(usd|revenue|lost sales|losing|loss|profit)\b", body, re.I):
        return False
    allowed = {str(n), str(k), f"{pct:g}", f"{pct:.1f}", str(round(pct))} | set(re.findall(r"\d+(?:\.\d+)?", sample))
    if not set(re.findall(r"\d+(?:\.\d+)?", body)) <= allowed:
        return False
    return sample.split(" (")[0].lower() in body.lower() and len(body) <= 900

def template(name, n, k, sample):
    pct = round(100 * k / n, 1)
    return {"subject": f"Quick note on {sample.split(' (')[0]} stock",
            "body": (f"Hi {name} team,\n\nWhile looking at your catalog of {n} SKUs, I noticed {k} ({pct}%) "
                     f"are currently out of stock - for example, \"{sample}\".\n\n"
                     f"I can set up back-in-stock and waitlist alerts so those visitors are captured instead of lost. "
                     f"Open to a quick look?")}

def draft(name, n, k, sample):
    key = os.getenv("GEMINI_API_KEY")
    if key:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=key)
            prompt = (f"Store: {name}\nTotal SKUs: {n}\nOut of stock: {k} ({round(100 * k / n, 1)}%)\n"
                      f"Example sold-out product: \"{sample}\"")
            resp = client.models.generate_content(
                model=config.GEMINI_MODEL, contents=prompt,
                config=types.GenerateContentConfig(system_instruction=SYSTEM, response_mime_type="application/json",
                                                   response_schema=SCHEMA))
            import json
            out = json.loads(resp.text)
            if out.get("subject") and body_ok(out.get("body", ""), n, k, sample):
                return {"subject": out["subject"].strip(), "body": out["body"].strip(), "src": "gemini"}
        except Exception as e:  # quota exhausted / wrong model / malformed JSON -> fallback
            print("gemini failed:", type(e).__name__)
    t = template(name, n, k, sample)
    t["src"] = "template"
    return t
