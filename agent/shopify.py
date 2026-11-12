"""Audit public Shopify catalog (/products.json). 403/bot-protection = skipped, not bypassed."""
import re, time, requests
from . import model

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
PAGE_DELAY = 1.0

def _get(url, accept="application/json", retries=2):
    for i in range(retries):
        try:
            r = requests.get(url, headers={"User-Agent": UA, "Accept": accept}, timeout=12)
            if r.status_code == 200:
                return r
            if r.status_code in (429, 503) and i < retries - 1:
                time.sleep(2 * (i + 1)); continue
            return None
        except requests.RequestException:
            time.sleep(1)
    return None

def audit(domain):
    prods = []
    for page in range(1, 11):
        r = _get(f"https://{domain}/products.json?limit=250&page={page}")
        if r is None:
            if page == 1:
                return {"status": "blocked"}
            break
        try:
            batch = r.json().get("products", [])
        except ValueError:
            if page == 1:
                return {"status": "blocked"}
            break
        if not batch:
            break
        prods += batch
        if len(batch) < 250:
            break
        time.sleep(PAGE_DELAY)
    n, items = 0, []
    for p in prods:
        for v in p.get("variants", []):
            n += 1
            if v.get("available", True) is False:
                vt = v.get("title") or ""
                items.append({"title": p.get("title", ""), "variant": "" if vt == "Default Title" else vt,
                              "ptype": p.get("product_type") or ""})
    if n == 0:
        return {"status": "blocked"}
    k = len(items)
    d = model.diffuseness([i["ptype"] for i in items]) if k else None
    c = model.core_share([i["variant"] for i in items]) if k else None
    return {"status": "ok", "n": n, "k": k, "items": items, "diffuse": d, "core": c,
            "score": float(model.pitch_score(k, n, d, c))}

def sample_item(items):
    it = items[0]
    return f'{it["title"]} ({it["variant"]})' if it["variant"] else it["title"]

# ---- contacts
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
GENERIC = {"support", "care", "help", "info", "contact", "orders", "service", "customerservice", "cs",
           "returns", "press", "privacy", "legal", "billing", "noreply", "no-reply"}
WARM = {"hello", "hi", "team", "partnerships", "wholesale", "founder", "ceo", "owner"}

def rank_contacts(emails, domain):
    label = domain.split(".")[0]
    good = []
    for e in {x.lower() for x in emails}:
        local, _, host = e.partition("@")
        if label not in host or e.endswith((".png", ".jpg", ".gif", ".webp")):
            continue
        kind = "generic" if local in GENERIC else "direct"
        pri = 1 if local in WARM else (2 if local in GENERIC else 0)
        good.append((pri, e, kind))
    good.sort()
    return (good[0][1], good[0][2]) if good else ("", "")

def find_contact(domain):
    found = []
    for path in ("/", "/pages/contact", "/pages/contact-us", "/pages/about"):
        r = _get(f"https://{domain}{path}", accept="text/html")
        if r is not None:
            found += EMAIL_RE.findall(r.text)
        time.sleep(0.5)
    return rank_contacts(found, domain)
