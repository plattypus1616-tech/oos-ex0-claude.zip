"""Orchestrator: inbox -> safety gates -> audit -> select (model) -> draft -> send -> report."""
import datetime as dt, os, random, time
import numpy as np
from scipy.stats import beta
from . import config, llm, mailer, model, notify, policy, shopify, store

SENT_FAMILY = ("sent", "replied", "bounced")

def today(): return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")

def metrics(leads, st):
    sent = [l for l in leads if l["status"] in SENT_FAMILY]
    return {"sends": len(sent), "positives": sum(l.get("reply_class") == "positive" for l in sent),
            "bounces": sum(l["status"] == "bounced" for l in sent),
            "complaints": st["complaints"] - st["ack_complaints"],
            "today": sum(1 for l in sent if (l.get("sent_at") or "").startswith(today()))}

def apply_events(leads, st, events, own=""):
    by_mid = {l["message_id"]: l for l in leads if l.get("message_id")}
    by_contact = {l["contact"].lower(): l for l in leads if l.get("contact")}
    notes = []
    for ev in events:
        if not ev["id"] or ev["id"] in st["processed"]:
            continue
        st["processed"].append(ev["id"])
        if ev["from"] == own.lower():
            continue
        if ev["is_bounce"]:
            lead = next((by_contact[e] for e in ev["emails"] if e in by_contact), None)
            if lead and ev["hard"] and lead["status"] == "sent":
                lead["status"] = "bounced"; notes.append(f"bounce: {lead['domain']}")
            continue
        lead = next((by_mid[r] for r in ev["refs"] if r in by_mid), None) or by_contact.get(ev["from"])
        if not lead:
            continue
        cls = mailer.classify_text(ev["text"])
        if cls == "auto":
            continue
        lead["reply_class"], lead["replied_at"] = cls, ev["date"]
        if lead["status"] == "sent":
            lead["status"] = "replied"
        if cls in ("complaint", "unsubscribe"):
            st["suppress"] += [lead["domain"], lead["contact"].lower()]
        if cls == "complaint":
            st["complaints"] += 1
        notes.append(f"reply {cls}: {lead['domain']}")
    return leads, st, notes

def calibration_gate(sends, positives, floor=None, min_sends=None, thr=None):
    """True = allowed to continue. P(positive-reply rate >= floor) from posterior Beta(1+x, 1+n-x)."""
    floor = config.POSITIVE_REPLY_FLOOR if floor is None else floor
    min_sends = config.CAL_MIN_SENDS if min_sends is None else min_sends
    thr = config.CAL_THRESHOLD if thr is None else thr
    if sends < min_sends:
        return True, ""
    p = float(beta.sf(floor, 1 + positives, 1 + sends - positives))
    return p >= thr, f"calibration: {positives}/{sends} positive replies, P(rate>={floor:.1%})={p:.0%}<{thr:.0%}"

def gates(leads, st):
    m = metrics(leads, st)
    reason = ""
    if st["manual_pause"]:
        reason = "manual pause"
    elif m["complaints"] >= config.STRIKE_BUDGET:
        reason = f"complaints {m['complaints']} >= strike budget {config.STRIKE_BUDGET}"
    elif m["sends"] >= 10 and m["bounces"] / m["sends"] > config.BOUNCE_MAX:
        reason = f"bounce {m['bounces']}/{m['sends']} > {config.BOUNCE_MAX:.0%}"
    else:
        ok, why = calibration_gate(m["sends"], m["positives"])
        if not ok:
            reason = why
    st["paused"], st["reason"] = bool(reason), reason
    return st

def effective_score(l):
    """Quantile pool mirrors model: stores without OOS still included (score -1); OOS stores without contact cannot be acted on."""
    if l["status"] in ("blocked", "skip"):
        return None
    if int(l.get("k") or 0) == 0:
        return -1.0
    if not l.get("contact"):
        return None
    s = float(l["score"])
    return s * (config.GENERIC_PENALTY if l["contact_kind"] == "generic" and s > 0 else 1)

def select(leads, st):
    pool = [(effective_score(l), l) for l in leads if effective_score(l) is not None]
    if len(pool) < config.MIN_POOL:
        return []
    thr = np.quantile([s for s, _ in pool], 1 - config.PITCH_QUANTILE)
    supp = set(st["suppress"])
    cand = [(s, l) for s, l in pool if s >= thr and s > 0 and l["status"] == "audited"
            and l["domain"] not in supp and l["contact"].lower() not in supp]
    return [l for _, l in sorted(cand, key=lambda x: -x[0])]

def handle_commands(st, cmds):
    for c in cmds:
        w = c.split()
        if len(w) == 2 and w[0].lower() == "add":
            store.add_target(w[1])
        elif c.lower() == "pause":
            st["manual_pause"] = True
        elif c.lower() == "resume":
            st["manual_pause"] = False
            st["ack_complaints"] = st["complaints"]
    return st

def main():
    leads, st = store.load_leads(), store.load_state()
    log = []
    cmds, st["tg_offset"] = notify.pull_commands(st["tg_offset"])
    st = handle_commands(st, cmds)
    if mailer.configured():
        try:
            leads, st, notes = apply_events(leads, st, mailer.fetch_recent(), own=os.getenv("GMAIL_USER", ""))
            log += notes
        except Exception as e:
            log.append(f"inbox failed: {type(e).__name__}")
    st = gates(leads, st)
    m0 = metrics(leads, st)
    pol = policy.decide(m0["sends"], m0["positives"])
    if pol["strategy"] == "SKIP" and not st["paused"]:
        st["paused"], st["reason"] = True, f"model: EV<=0 for all strategies ({pol['note']})"
    elif pol["quantile"]:
        config.PITCH_QUANTILE = pol["quantile"]
    store._p("policy.json").write_text(__import__("json").dumps(pol, indent=1), encoding="utf-8")

    known = {l["domain"] for l in leads}
    new_t = [d for d in store.load_targets() if d not in known][:config.AUDIT_PER_RUN]
    audited = 0
    if not st["paused"]:
        for d in new_t:
            a = shopify.audit(d)
            row = {"domain": d, "name": d.split(".")[0].capitalize(), "audited_at": today()}
            if a["status"] != "ok":
                row["status"] = "blocked"
            else:
                contact, kind = shopify.find_contact(d) if a["k"] > 0 else ("", "")
                row.update(status="audited", n=a["n"], k=a["k"], oos_pct=round(100 * a["k"] / a["n"], 1),
                           diffuse="" if a["diffuse"] is None else round(a["diffuse"], 3),
                           core="" if a["core"] is None else round(a["core"], 3), score=round(a["score"], 4),
                           contact=contact, contact_kind=kind)
                row["sample"] = shopify.sample_item(a["items"]) if a["k"] else ""
            leads.append(row); audited += 1

    sent_now, drafted = 0, []
    if not st["paused"]:
        room = max(0, config.DAILY_CAP - metrics(leads, st)["today"])
        for l in select(leads, st)[:room]:
            d = llm.draft(l["name"], int(l["n"]), int(l["k"]), l.get("sample") or l["name"])
            l["subject"], l["body"] = d["subject"], d["body"]
            if config.MODE == "send" and mailer.configured():
                l["message_id"] = mailer.send_email(l["contact"], d["subject"], d["body"])
                l["status"], l["sent_at"] = "sent", dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
                sent_now += 1
                time.sleep(config.SEND_DELAY + random.uniform(0, 15))
            else:
                l["status"] = "drafted"; drafted.append(l)

    store.save_leads(leads); store.save_state(st)
    m = metrics(leads, st)
    msg = [f"oos-agent {today()} mode={config.MODE} {'PAUSE: ' + st['reason'] if st['paused'] else 'active'}",
           f"new audits {audited} | sent today {m['today']}/{config.DAILY_CAP} (+{sent_now}) | drafted {len(drafted)}",
           f"model policy: {pol['strategy']} ({pol['note']})",
           f"total sent {m['sends']} | positive replies {m['positives']} | bounces {m['bounces']} | complaints {m['complaints']}"] + log[:8]
    notify.send("\n".join(msg))
    print("\n".join(msg))
    return {"audited": audited, "sent": sent_now, "drafted": len(drafted), "paused": st["paused"]}

if __name__ == "__main__":
    main()
