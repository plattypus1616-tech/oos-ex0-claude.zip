import csv, json, os
from pathlib import Path

STATE_DIR = Path(os.getenv("STATE_DIR", "state"))
FIELDS = ["domain", "name", "status", "audited_at", "n", "k", "oos_pct", "diffuse", "core", "score",
          "contact", "contact_kind", "sample", "subject", "body", "sent_at", "message_id", "reply_class", "replied_at"]
DEFAULT_STATE = {"paused": False, "reason": "", "manual_pause": False, "processed": [], "tg_offset": 0,
                 "complaints": 0, "ack_complaints": 0, "suppress": []}

def _p(name):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / name

def load_leads():
    p = _p("leads.csv")
    if not p.exists():
        return []
    with p.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def save_leads(rows):
    with _p("leads.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})

def load_state():
    p = _p("state.json")
    st = json.loads(json.dumps(DEFAULT_STATE))
    if p.exists():
        st.update(json.loads(p.read_text(encoding="utf-8")))
    return st

def save_state(st):
    st["processed"] = st["processed"][-500:]
    _p("state.json").write_text(json.dumps(st, indent=1), encoding="utf-8")

def norm_domain(s):
    s = s.strip().lower().replace("https://", "").replace("http://", "")
    s = s.split("/")[0]
    return s[4:] if s.startswith("www.") else s

def load_targets(path="targets.txt"):
    if not os.path.exists(path):
        return []
    out = []
    for line in open(path, encoding="utf-8"):
        line = line.split("#")[0].strip()
        if line and norm_domain(line) not in out:
            out.append(norm_domain(line))
    return out

def add_target(domain, path="targets.txt"):
    d = norm_domain(domain)
    if d and "." in d and d not in load_targets(path):
        with open(path, "a", encoding="utf-8") as f:
            f.write(d + "\n")
        return True
    return False
