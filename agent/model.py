#!/usr/bin/env python3
"""
oos_decision_model.py - Final decision model for "Shopify OOS & AI Outreach Auditor"

Core question: out of audited stores, which ones are worth pitching, how many, and
which strategy is most robust across all scenarios (A-Z)?

Layers:
 1. First principles : SKU = 2-state process (in-stock <-> OOS). pi = lam/(lam+mu).
                       Snapshot k/n -> posterior Beta(1+k, 1+n-k).
 2. Entropy          : (a) OOS diffuseness across categories (structural vs concentrated)
                       (b) posterior differential entropy -> re-audit priority
 3. Second-order     : OOS != problem. Chain: unintentional? -> lack tooling? ->
                       severe enough? -> reply? -> close?
 4. Survival         : (a) restock hazard from repeated snapshots (exponential MLE + censoring)
                       (b) sender domain "dies" if strikes (spam/bounce) >= B
 5. Game theory      : strategy x scenario payoff matrix -> maximin, minimax regret,
                       optimal mixed strategy (zero-sum LP vs "nature")
 6. Monte Carlo      : all parameters = distributions, not single numbers

Iron rule: inputs are strictly audit FACTS (n, k, variant titles, categories). No estimated
financial loss of the target store. Payoffs are in "deal-equivalent" (D), not currency.
All parameters labeled ASSUMPTION should be calibrated against your own outreach funnel.

Usage:  python oos_decision_model.py                 # selftest + scenarios A-Z + game
        python oos_decision_model.py --audits a.json # rank real stores (StoreAuditResult array)
"""
import argparse, json, re
from dataclasses import dataclass, replace
import numpy as np
from scipy.stats import beta as beta_dist
from scipy.optimize import linprog

# ---------------------------------------------------------------- model constants
PI0 = 0.08                 # OOS rate where "severity" = 50% (ASSUMPTION; 1% OOS is noise)
UNINT_ASSUMED = 0.45       # sender prior: P(OOS is unintentional) (ASSUMPTION)
TOOL_ASSUMED = 0.30        # sender prior: P(store already has back-in-stock) (ASSUMPTION)
W_DIFFUSE, W_CORE = 1.2, 0.9   # logit weights for second-order features (ASSUMPTION; calibrate from results)
KAPPA = 6.0                # Beta concentration across stores (small = heterogeneous)
CORE = {"s", "m", "l"}
SIZE = re.compile(r"^(xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl)$", re.I)

expit = lambda x: 1 / (1 + np.exp(-x))
logit = lambda p: np.log(p / (1 - p))


# ---------------------------------------------------------------- 1. first principles
def oos_posterior(k, n, a0=1.0, b0=1.0):
    """Beta posterior for pi = P(stationary OOS) from 1 snapshot."""
    return a0 + k, b0 + n - k

def restock_posterior(spells, a0=1.0, b0=10.0):
    """spells: [(duration_days, restocked_bool)]. Gamma prior on mu (per day); prior mean 0.1/day.
    Right-censoring handled: unfinished spells add exposure without adding events."""
    ev = sum(1 for _, r in spells if r)
    expo = sum(d for d, _ in spells)
    return a0 + ev, b0 + expo            # Gamma(shape, rate)

def stockout_hazard(pi, mu):
    """lam = mu * pi / (1 - pi)  (inverse of pi = lam / (lam + mu))."""
    return mu * pi / (1 - pi)


# ---------------------------------------------------------------- 2. entropy
def diffuseness(categories):
    """Normalized Shannon entropy H/log(m) of OOS spread across categories.
    High = diffuse (indicates ongoing replenishment); low = concentrated (indicates drop/discontinuation).
    None if non-informative (single category / all 'General')."""
    cats = [c or "General" for c in categories]
    vals, cnt = np.unique(cats, return_counts=True)
    if len(vals) < 2:
        return None
    p = cnt / cnt.sum()
    return float(-(p * np.log(p)).sum() / np.log(len(vals)))

def core_share(variant_titles):
    """Share of OOS in core sizes (S/M/L) among variants with recognizable sizes. Extreme sizes
    (XS, XXL, etc.) selling out is normal (tail of size curve); core sizes out of stock = demand > supply."""
    toks = []
    for t in variant_titles:
        for tok in re.split(r"[\s/|-]+", t or ""):
            if SIZE.match(tok):
                toks.append(tok.lower()); break
    return sum(t in CORE for t in toks) / len(toks) if len(toks) >= 3 else None

def reaudit_priority(k, n):
    """Posterior differential entropy: higher = more uncertain = worth re-auditing."""
    return float(beta_dist(*oos_posterior(k, n)).entropy())


# ---------------------------------------------------------------- 3. second-order
def unint_mean(d, c, base=UNINT_ASSUMED):
    """P(OOS is unintentional) from entropy & size-curve features. d,c in [0,1]; neutral = 0.5."""
    return expit(logit(base) + W_DIFFUSE * (d - 0.5) + W_CORE * (c - 0.5))

def severity(pi_hat):
    return pi_hat / (pi_hat + PI0)

def pitch_score(k, n, d=0.5, c=0.5):
    """Pitch relevance score (0..1) from audit facts; used for ranking. k==0 -> -1 (no evidence)."""
    d = 0.5 if d is None else d
    c = 0.5 if c is None else c
    s = unint_mean(d, c) * (1 - TOOL_ASSUMED) * severity((1 + k) / (2 + n))
    return np.where(np.asarray(k) > 0, s, -1.0)


# ---------------------------------------------------------------- parameters & scenarios
@dataclass
class Params:
    pool_n: float = 60       # audited stores count per campaign
    pool_oos: float = 0.15   # average OOS rate across stores (ASSUMPTION)
    unint: float = 0.45      # true P(unintentional OOS) (ASSUMPTION)
    tool: float = 0.30       # true P(already has back-in-stock tool) (ASSUMPTION)
    reply_rel: float = 0.05  # P(reply | relevant) (ASSUMPTION; vendor benchmark: 1.5-3% avg, 4-5% targeted)
    reply_irr: float = 0.008 # P(reply | irrelevant): polite rejection, no deal
    close: float = 0.20      # P(close | reply & relevant) (ASSUMPTION)
    strike: float = 0.001    # P(spam-complaint/hard-bounce | send, relevant). Anchor: Gmail <0.10%
    gamma_irr: float = 6.0   # strike multiplier for irrelevant emails (ASSUMPTION)
    rho: float = 0.6         # how informative score is of ground truth (1 = perfect)
    deal: float = 1.0        # value of 1 deal (units of D)
    cost: float = 0.002      # cost per send (D) (ASSUMPTION; personalization time)
    B: int = 2               # strike budget before domain "dies" (B=1 = strictest interpretation)
    L_ruin: float = 3.0      # loss if domain dies (D)

PROB_FIELDS = ("pool_oos", "unint", "tool", "reply_rel", "reply_irr", "close", "strike", "rho")

def apply(p, mult):
    kw = {}
    for f, m in mult.items():
        v = getattr(p, f) * m
        kw[f] = min(max(v, 1e-4), 0.98) if f in PROB_FIELDS else (max(5, round(v)) if f == "pool_n" else v)
    return replace(p, **kw)

def merge(*ms):
    out = {}
    for m in ms:
        for k, v in m.items():
            out[k] = out.get(k, 1.0) * v
    return out

_base = {
    "B": ("High-pain store (unintentional OOS, no tools)", {"unint": 1.5, "tool": 0.5}),
    "C": ("Majority of OOS intentional (drop/scarcity model)", {"unint": 0.4}),
    "D": ("Competitors already pitched the same store", {"reply_rel": 0.5, "reply_irr": 0.5, "close": 0.7}),
    "E": ("High back-in-stock tool adoption", {"tool": 2.0}),
    "F": ("Domain reputation degrades", {"strike": 3.0}),
    "G": ("Clean & warm domain", {"strike": 0.4}),
    "H": ("Peak season (BFCM): OOS rises, owner busy", {"pool_oos": 1.5, "reply_rel": 0.6, "reply_irr": 0.6}),
    "I": ("Low season: OOS drops, owner has bandwidth", {"pool_oos": 0.7, "reply_rel": 1.3, "reply_irr": 1.3}),
    "J": ("Supply chain disruptions", {"pool_oos": 1.8, "unint": 1.3, "reply_rel": 0.8}),
    "K": ("Small store: fast reply, tight budget", {"reply_rel": 1.3, "close": 0.6, "deal": 0.5}),
    "L": ("Large store: slow, big closing, already has tools", {"reply_rel": 0.6, "close": 1.4, "deal": 2.5, "tool": 1.5}),
    "M": ("Generic contact (support@)", {"reply_rel": 0.5, "reply_irr": 0.5, "strike": 1.5}),
    "N": ("Direct founder contact", {"reply_rel": 1.8, "strike": 0.7}),
    "O": ("Video personalization (Loom)", {"reply_rel": 1.6, "close": 1.2, "cost": 3.0}),
    "P": ("Generic template", {"reply_rel": 0.6, "strike": 2.0}),
    "Q": ("Exaggerated claims (loss/revenue)", {"reply_rel": 1.3, "strike": 3.5, "close": 0.5}),
    "R": ("Honest facts-only (current app rule)", {"close": 1.1, "strike": 0.8}),
    "S": ("Noisy data: pre-order/continue-selling read as OOS", {"unint": 0.6, "rho": 0.5}),
    "T": ("Catalog blocked by bot protection", {"pool_n": 0.4}),
    "U": ("Anti-spam enforcement tightens", {"strike": 2.0, "reply_rel": 0.8}),
    "V": ("Price war / low ACV", {"deal": 0.4, "close": 0.8}),
    "W": ("Long sales cycle (closing beyond horizon)", {"close": 0.6}),
    "X": ("Warm referral / intro", {"reply_rel": 2.5, "reply_irr": 1.5, "close": 1.5, "strike": 0.5, "pool_n": 0.3}),
}
SCEN = {"A": ("Baseline (prior)", {})}
SCEN.update(_base)
SCEN["Y"] = ("Perfect storm (C+D+E+F)", merge(_base["C"][1], _base["D"][1], _base["E"][1], _base["F"][1]))
SCEN["Z"] = ("Dream case (B+G+N+O)", merge(_base["B"][1], _base["G"][1], _base["N"][1], _base["O"][1]))
STRESS = {"Y", "Z"}   # used in maximin/regret, excluded from Bayes average

STRATS = {"SKIP": None, "TOP15": 0.15, "TOP30": 0.30, "TOP60": 0.60, "SPRAY": 1.0}


# ---------------------------------------------------------------- 6. Monte Carlo
def simulate(strategy, p, N=10000, seed=7):
    """Single campaign = pool of M stores. Return U (utility per path), deals, sends, ruin.
    Same seed across strategies/scenarios -> common random numbers (paired comparisons)."""
    rng = np.random.default_rng(seed)
    M = int(p.pool_n)
    sh = (N, M)
    n = np.clip(rng.lognormal(np.log(120), 0.9, sh), 10, 2500).astype(int)
    pi = rng.beta(p.pool_oos * KAPPA, (1 - p.pool_oos) * KAPPA, sh)
    k = rng.binomial(n, pi)
    d, c = rng.beta(4, 4, sh), rng.beta(4, 4, sh)
    u_unint, u_tool, u_sev, u_rep, u_close, u_strk = (rng.random(sh) for _ in range(6))

    # ground truth (hidden from sender)
    m_true = p.rho * unint_mean(d, c, p.unint) + (1 - p.rho) * p.unint
    rel = (u_unint < m_true) & (u_tool >= p.tool) & (u_sev < severity(pi))
    # sender view (audit facts + assumptions only)
    score = pitch_score(k, n, d, c)

    if strategy == "SKIP":
        return dict(U=np.zeros(N), deals=np.zeros(N), sends=np.zeros(N), ruin=np.zeros(N, bool))
    q = STRATS[strategy]
    if q >= 1.0:
        send, order = k > 0, np.tile(np.arange(M), (N, 1))          # random order
    else:
        thr = np.quantile(score, 1 - q, axis=1, keepdims=True)
        send, order = (score >= thr) & (k > 0), np.argsort(-score, axis=1)  # best first
    g = lambda a: np.take_along_axis(a, order, axis=1)
    send, rel, u_rep, u_close, u_strk = g(send), g(rel), g(u_rep), g(u_close), g(u_strk)

    reply = u_rep < np.where(rel, p.reply_rel, p.reply_irr)
    deal = reply & rel & (u_close < p.close)
    strike = send & (u_strk < np.where(rel, p.strike, p.strike * p.gamma_irr))
    cs = np.cumsum(strike, axis=1)
    alive = (cs - strike) < p.B                    # domain still alive when this email was sent
    deals = (deal & send & alive).sum(1)
    sends = (send & alive).sum(1)
    ruin = cs[:, -1] >= p.B
    U = p.deal * deals - p.cost * sends - p.L_ruin * ruin
    return dict(U=U, deals=deals, sends=sends, ruin=ruin)

def summarize(r):
    U = r["U"]; lo = np.sort(U)[: max(1, len(U) // 20)]
    return dict(EV=U.mean(), SE=U.std(ddof=1) / np.sqrt(len(U)), P_pos=(U > 0).mean(),
                CVaR5=lo.mean(), P_ruin=r["ruin"].mean(), deals=r["deals"].mean(), sends=r["sends"].mean())

def run_grid(base=Params(), N=10000, seed=7):
    res = {}
    for s, (name, mult) in SCEN.items():
        p = apply(base, mult)
        for st in STRATS:
            res[(s, st)] = summarize(simulate(st, p, N, seed))
    return res


# ---------------------------------------------------------------- 5. game theory
def game(res):
    S, T = list(SCEN), list(STRATS)
    U = np.array([[res[(s, t)]["EV"] for t in T] for s in S])
    bayes_rows = [i for i, s in enumerate(S) if s not in STRESS]
    out = {"U": U, "S": S, "T": T}
    out["maximin"] = T[int(np.argmax(U.min(axis=0)))]
    out["minimax_regret"] = T[int(np.argmin((U.max(axis=1, keepdims=True) - U).max(axis=0)))]
    out["bayes"] = T[int(np.argmax(U[bayes_rows].mean(axis=0)))]
    out["bayes_ev"] = U[bayes_rows].mean(axis=0)
    # maximin mixed strategy: max v s.t. sum_j x_j U[s,j] >= v for all s
    J = len(T)
    A = np.hstack([-U, np.ones((len(S), 1))])
    r = linprog(c=[0] * J + [-1], A_ub=A, b_ub=np.zeros(len(S)),
                A_eq=[[1] * J + [0]], b_eq=[1], bounds=[(0, 1)] * J + [(None, None)])
    out["mix"] = dict(zip(T, np.round(r.x[:J], 3))); out["mix_value"] = r.x[J]
    return out


def sensitivity(strategy="TOP30", base=Params(), N=10000, seed=7):
    """One-at-a-time tornado: each assumption x0.5 and x1.5 -> strategy EV (common random numbers)."""
    ev = lambda p: summarize(simulate(strategy, p, N, seed))["EV"]
    rows = [(f, ev(apply(base, {f: 0.5})), ev(apply(base, {f: 1.5}))) for f in
            ("reply_rel", "close", "cost", "deal", "unint", "tool", "strike", "rho", "pool_oos", "pool_n")]
    rows.sort(key=lambda r: -abs(r[2] - r[1]))
    return ev(base), rows

def breakeven_reply(strategy="TOP30", base=Params(), N=10000, seed=7):
    """Minimum P(reply | relevant) for strategy EV > 0 (bisection; EV is monotonic in reply)."""
    lo, hi = base.reply_rel * 0.2, base.reply_rel * 5
    for _ in range(18):
        mid = (lo + hi) / 2
        if summarize(simulate(strategy, replace(base, reply_rel=mid), N, seed))["EV"] > 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2


# ---------------------------------------------------------------- real data from app
def rank_real(audits, q_star=0.30):
    """audits: StoreAuditResult array (JSON from app). Note: soldOutProducts in app is capped to
    top 50 items by price -> entropy/size-curve features are biased toward expensive items."""
    rows = []
    for a in audits:
        n, k = a.get("totalVariantsScanned", 0), a.get("soldOutCount", 0)
        if n <= 0:
            continue
        items = a.get("soldOutProducts", [])
        d = diffuseness([i.get("productType") for i in items])
        c = core_share([i.get("variantTitle") for i in items])
        lo, hi = beta_dist.ppf([0.05, 0.95], *oos_posterior(k, n))
        rows.append(dict(store=a.get("cleanDomain"), n=n, k=k, oos=k / n, lo=lo, hi=hi,
                          diffuse=d, core=c, score=float(pitch_score(k, n, d, c)),
                          H_post=reaudit_priority(k, n)))
    rows.sort(key=lambda r: -r["score"])
    cut = max(1, int(np.ceil(q_star * len(rows))))
    for i, r in enumerate(rows):
        r["action"] = "PITCH" if (i < cut and r["k"] > 0) else ("RE-AUDIT" if r["H_post"] > -2.0 and r["k"] > 0 else "SKIP")
    return rows


# ---------------------------------------------------------------- selftest (validation before trust)
def selftest():
    ok = True
    def chk(name, cond, info=""):
        nonlocal ok; ok &= bool(cond); print(f"  [{'OK' if cond else 'FAIL'}] {name} {info}")
    rng = np.random.default_rng(1)
    # 1. 90% Beta CI coverage (small-medium n)
    hit = 0; T = 4000
    for _ in range(T):
        pi = rng.beta(1.5, 8); n = int(rng.integers(20, 400)); k = rng.binomial(n, pi)
        lo, hi = beta_dist.ppf([0.05, 0.95], *oos_posterior(k, n)); hit += lo <= pi <= hi
    chk("Posterior 90% CI covers true pi", abs(hit / T - 0.90) < 0.03, f"(coverage={hit/T:.3f}, prior slightly different from Beta(1,1) -> 3pp tolerance)")
    # 2. recovery of mu from censored spells
    mu = 0.10; dur = rng.exponential(1 / mu, 3000); cens = 30.0
    spells = [(min(x, cens), x <= cens) for x in dur]
    a, b = restock_posterior(spells, a0=0.01, b0=0.01)
    chk("MLE restock hazard recovered with censoring", abs(a / b - mu) < 0.005, f"(mu_hat={a/b:.4f}, true={mu})")
    # 3. SKIP exactly 0
    chk("SKIP => U = 0", simulate("SKIP", Params(), 500)["U"].sum() == 0)
    # 4. analytic ruin: uniform strike s, B=1, m sends -> 1-(1-s)^m
    s, m = 0.01, 40
    p = replace(Params(), pool_n=m, pool_oos=0.9, strike=s, gamma_irr=1.0, B=1, close=0.0)
    r = simulate("SPRAY", p, 20000, seed=3); emp = r["ruin"].mean(); ana = 1 - (1 - s) ** r["sends"].max()
    se = np.sqrt(emp * (1 - emp) / 20000)
    chk("P(ruin) MC matches 1-(1-s)^m", abs(emp - ana) < 3 * se + 0.01, f"(MC={emp:.3f}, analytic~{ana:.3f})")
    # 5. two seeds consistent
    e1 = summarize(simulate("SPRAY", Params(), 10000, 11)); e2 = summarize(simulate("SPRAY", Params(), 10000, 22))
    chk("Two seeds consistent (SPRAY EV)", abs(e1["EV"] - e2["EV"]) < 3 * np.hypot(e1["SE"], e2["SE"]), f"({e1['EV']:.4f} vs {e2['EV']:.4f})")
    # 6. monotonic: higher reply => more deals
    lo_, hi_ = summarize(simulate("TOP30", Params(), 8000))["deals"], summarize(simulate("TOP30", replace(Params(), reply_rel=0.10), 8000))["deals"]
    chk("reply_rel x2 => deals increase", hi_ > lo_, f"({lo_:.3f} -> {hi_:.3f})")
    # 7. all scenario probabilities in [0,1]
    bad = [s for s, (_, mu_) in SCEN.items() if any(not 0 <= getattr(apply(Params(), mu_), f) <= 1 for f in PROB_FIELDS)]
    chk("All scenario probabilities valid", not bad, str(bad))
    chk("Scenario count = 26", len(SCEN) == 26)
    return ok


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audits"); ap.add_argument("--paths", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=7); ap.add_argument("--csv", default="scenario_results.csv")
    ap.add_argument("--skip-selftest", action="store_true"); ap.add_argument("--sensitivity", action="store_true")
    a = ap.parse_args()

    if a.audits:
        for r in rank_real(json.load(open(a.audits))):
            f = lambda x: "  -  " if x is None else f"{x:.2f}"
            print(f"{r['store']:<28} n={r['n']:<5} k={r['k']:<4} OOS={r['oos']:.1%} [{r['lo']:.1%},{r['hi']:.1%}] "
                  f"diffuse={f(r['diffuse'])} core={f(r['core'])} score={r['score']:.3f} -> {r['action']}")
        return

    if not a.skip_selftest:
        print("SELFTEST"); assert selftest(), "selftest failed - aborting"
    res = run_grid(Params(), a.paths, a.seed)
    G = game(res)
    print("\nSCENARIOS A-Z (EV in deal-equivalent D per campaign; ruin = dead domain)")
    print(f"{'':2}{'scenario':<52}" + "".join(f"{t:>8}" for t in STRATS) + "  best     ruin30 ruinSPR")
    for s, (name, _) in SCEN.items():
        evs = {t: res[(s, t)]["EV"] for t in STRATS}; best = max(evs, key=evs.get)
        print(f"{s:2}{name:<52}" + "".join(f"{evs[t]:8.3f}" for t in STRATS) + f"  {best:<8}{res[(s, 'TOP30')]['P_ruin']:6.1%}{res[(s, 'SPRAY')]['P_ruin']:7.1%}")
    print("\nGAME THEORY (sender strategy vs scenario as 'nature')")
    print("  Bayes average EV (A-X):", {t: round(float(v), 3) for t, v in zip(G['T'], G['bayes_ev'])})
    print("  Bayes:", G["bayes"], "| Maximin:", G["maximin"], "| Minimax regret:", G["minimax_regret"])
    print("  Optimal maximin mixed strategy:", {t: float(v) for t, v in G["mix"].items()}, "value:", round(float(G["mix_value"]), 4))
    if a.sensitivity:
        e0, rows = sensitivity(N=a.paths, seed=a.seed)
        print(f"\nSENSITIVITY TOP30 @ baseline (EV={e0:.4f} D): assumptions x0.5 | x1.5")
        for f_, lo_, hi_ in rows:
            print(f"  {f_:<10}{lo_:8.4f} |{hi_:8.4f}")
        for st in ("TOP15", "TOP30"):
            print(f"  break-even P(reply|relevant) {st}: {breakeven_reply(st, N=a.paths, seed=a.seed):.3f} (assumption {Params().reply_rel})")
        G1 = game(run_grid(replace(Params(), B=1), a.paths, a.seed))
        print(f"  If B=1 (strictest ruin): Bayes={G1['bayes']} Maximin={G1['maximin']} Regret={G1['minimax_regret']}")
    with open(a.csv, "w") as f:
        f.write("scenario,name,strategy,EV,SE,P_pos,CVaR5,P_ruin,deals,sends\n")
        for (s, t), v in res.items():
            f.write(f"{s},\"{SCEN[s][0]}\",{t},{v['EV']:.5f},{v['SE']:.5f},{v['P_pos']:.4f},{v['CVaR5']:.4f},{v['P_ruin']:.4f},{v['deals']:.4f},{v['sends']:.2f}\n")
    print("\nSaved:", a.csv)

if __name__ == "__main__":
    main()
