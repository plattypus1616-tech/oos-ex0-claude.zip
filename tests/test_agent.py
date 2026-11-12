import os, shutil, tempfile, unittest
from unittest import mock

TMP = tempfile.mkdtemp()
os.environ["STATE_DIR"] = TMP
os.environ["SEND_DELAY"] = "0"
for k in ("GMAIL_USER", "GMAIL_APP_PASSWORD", "GEMINI_API_KEY", "TELEGRAM_TOKEN"):
    os.environ.pop(k, None)

from agent import config, llm, mailer, policy, run, shopify, store  # noqa: E402

def fake_products(n_prod, oos_idx):
    prods = []
    for i in range(n_prod):
        sizes = ["S", "M", "L", "XL"]
        prods.append({"id": i, "title": f"Tee {i}", "product_type": ["Tee", "Hoodie", "Cap"][i % 3],
                      "variants": [{"title": f"{s} / Black", "available": not ((i, j) in oos_idx)} for j, s in enumerate(sizes)]})
    return prods

class Resp:
    def __init__(self, data=None, text="", code=200): self._d, self.text, self.status_code = data, text, code
    def json(self): return self._d

def fake_get(url, **kw):
    dom = url.split("/")[2]
    if "products.json" in url:
        if dom == "blocked.test": return Resp(code=403)
        if dom == "clean.test": return Resp({"products": fake_products(40, set())})
        if "page=1" in url:
            oos = {(i, j) for i in range(0, 40, 2) for j in (1, 2)}   # 40 of 160 = 25% (M & L sold out)
            return Resp({"products": fake_products(40, oos)})
        return Resp({"products": []})
    return Resp(text=f"contact hello@{dom} or support@{dom} or x@sentry.io")

class T(unittest.TestCase):
    def setUp(self):
        for f in os.listdir(TMP): os.remove(os.path.join(TMP, f))

    def test_audit_counts(self):
        with mock.patch("agent.shopify.requests.get", fake_get), mock.patch("agent.shopify.time.sleep"):
            a = shopify.audit("shop.test")
        self.assertEqual((a["status"], a["n"], a["k"]), ("ok", 160, 40))
        self.assertGreater(a["score"], 0)
        with mock.patch("agent.shopify.requests.get", fake_get):
            self.assertEqual(shopify.audit("blocked.test")["status"], "blocked")
            self.assertEqual(shopify.audit("clean.test")["k"], 0)

    def test_contact_ranking(self):
        self.assertEqual(shopify.rank_contacts(["support@a.com", "hello@a.com", "x@sentry.io"], "a.com"), ("hello@a.com", "direct"))
        self.assertEqual(shopify.rank_contacts(["jane@a.com", "hello@a.com"], "a.com")[0], "jane@a.com")
        self.assertEqual(shopify.rank_contacts(["support@a.com"], "a.com"), ("support@a.com", "generic"))
        self.assertEqual(shopify.rank_contacts(["x@sentry.io"], "a.com"), ("", ""))

    def test_body_validator(self):
        s = "Tee 1 (M / Black)"
        self.assertTrue(llm.body_ok("We checked 160 SKUs; 40 (25%) are out, e.g. Tee 1.", 160, 40, s))
        self.assertFalse(llm.body_ok("You lose $5,000 a month. Tee 1 is out of 160 SKUs.", 160, 40, s))
        self.assertFalse(llm.body_ok("About 60% sold out, e.g. Tee 1, of 160 SKUs.", 160, 40, s))
        self.assertFalse(llm.body_ok("160 SKUs, 40 out of stock.", 160, 40, s))   # without product name
        self.assertTrue(llm.body_ok(llm.template("Acme", 160, 40, s)["body"], 160, 40, s))

    def test_classify(self):
        c = mailer.classify_text
        self.assertEqual(c("Not interested, thanks"), "negative")
        self.assertEqual(c("Sounds good, tell me more"), "positive")
        self.assertEqual(c("stop"), "unsubscribe")
        self.assertEqual(c("This is spam, I will report you"), "complaint")
        self.assertEqual(c("I am out of office until Monday"), "auto")
        self.assertEqual(c("Sure!\n> original: demo pricing interested\nOn Mon, X wrote:\n> hi"), "other")

    def test_calibration_gate(self):
        self.assertTrue(run.calibration_gate(30, 0)[0])            # insufficient data
        self.assertTrue(run.calibration_gate(100, 0)[0])           # 0/100 not enough evidence (1.2% => expected 1.2 replies)
        self.assertFalse(run.calibration_gate(250, 0)[0])          # 0/250 -> pause
        self.assertTrue(run.calibration_gate(250, 6)[0])           # 2.4% > floor
        self.assertTrue(run.calibration_gate(100, 3)[0])

    def test_circuit_breaker(self):
        leads = [{"domain": "a.test", "contact": "hello@a.test", "status": "sent", "message_id": "<m1>", "sent_at": run.today()}]
        st = store.load_state()
        ev = [{"id": "<r1>", "from": "hello@a.test", "text": "this is spam", "refs": ["<m1>"], "is_bounce": False, "hard": False, "emails": [], "date": "d"}]
        leads, st, _ = run.apply_events(leads, st, ev, own="me@x.com")
        self.assertEqual((st["complaints"], leads[0]["status"]), (1, "replied"))
        self.assertTrue(run.gates(leads, st)["paused"])
        st["ack_complaints"] = st["complaints"]; st["manual_pause"] = False
        self.assertFalse(run.gates(leads, st)["paused"])
        # event processed only once
        leads, st, notes = run.apply_events(leads, st, ev, own="me@x.com")
        self.assertEqual(st["complaints"], 1)

    def test_bounce_rate_gate(self):
        leads = [{"domain": f"{i}.t", "status": "bounced" if i < 3 else "sent", "contact": "", "sent_at": run.today()} for i in range(20)]
        st = run.gates(leads, store.load_state())
        self.assertTrue(st["paused"] and "bounce" in st["reason"])

    def test_end_to_end_dry_and_send(self):
        doms = [f"s{i}.test" for i in range(12)] + ["clean.test", "blocked.test"]
        with mock.patch("agent.store.load_targets", lambda p="x": doms), \
             mock.patch("agent.shopify.requests.get", fake_get), mock.patch("agent.shopify.time.sleep"):
            r1 = run.main()
            leads = store.load_leads()
            st = {l["domain"]: l["status"] for l in leads}
            self.assertEqual(st["blocked.test"], "blocked")
            self.assertEqual(st["clean.test"], "audited")
            self.assertGreaterEqual(r1["drafted"], 1)
            self.assertLessEqual(r1["drafted"], config.DAILY_CAP)
            self.assertEqual(r1["sent"], 0)                              # dry mode
            n_before = len(leads)
            run.main()
            self.assertEqual(len(store.load_leads()), n_before)           # idempotent, no duplicate audits

    def test_send_mode_respects_cap_and_suppress(self):
        doms = [f"s{i}.test" for i in range(14)]
        sent = []
        with mock.patch("agent.store.load_targets", lambda p="x": doms), \
             mock.patch("agent.shopify.requests.get", fake_get), mock.patch("agent.shopify.time.sleep"), \
             mock.patch.object(config, "MODE", "send"), mock.patch.object(config, "DAILY_CAP", 3), \
             mock.patch("agent.mailer.configured", lambda: True), \
             mock.patch("agent.mailer.fetch_recent", lambda: []), \
             mock.patch("agent.mailer.send_email", lambda to, s, b: sent.append(to) or f"<{len(sent)}@t>"):
            st = store.load_state(); st["suppress"] = ["s0.test"]; store.save_state(st)
            r = run.main()
            self.assertEqual(r["sent"], len(sent))
            self.assertLessEqual(len(sent), 3)
            self.assertTrue(len(sent) >= 1)
            self.assertNotIn("hello@s0.test", sent)
            r2 = run.main()                                               # same day -> 0 quota remaining
            self.assertEqual(r2["sent"], 0)

class TPolicy(unittest.TestCase):
    def test_policy(self):
        self.assertEqual(policy.decide(10, 0)["strategy"], "TOP30")        # few data points -> prior
        self.assertEqual(policy.decide(150, 0)["strategy"], "SKIP")        # 0/150 -> stop
        good = policy.decide(100, 4)                                       # 4% positive replies
        self.assertNotEqual(good["strategy"], "SKIP")
        self.assertGreater(max(good["ev"].values()), 0)
        self.assertLess(policy.posterior_reply_rel(100, 0), policy.posterior_reply_rel(100, 4))

if __name__ == "__main__":
    unittest.main(verbosity=2)
