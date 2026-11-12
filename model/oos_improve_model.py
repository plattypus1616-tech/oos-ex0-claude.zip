#!/usr/bin/env python3
"""
oos_improve_model.py - App improvement strategy model with OPPORTUNITY COST.

First principle : utility U = deals - send costs + value of free hours (opportunity cost) - loss if "dead".
                  Limited working hours (T weeks x HPW hours); hours not spent building = spent on alternatives.
Second-order    : security/reliability/UI do not directly add deals; effects operate via incident hazard,
                  outage hazard, recipient trust (reply x), and cost of subsequent changes.
Survival        : incident (abuse of open endpoints) -> 3-week halt + 30h cleanup; sender domain dies
                  if strikes >= B (B=1); VALIDATE path has a kill rule.
Entropy         : information value of sending n emails -> reduction in posterior entropy of positive reply rate q.
Game theory     : strategy x "nature" scenario matrix -> maximin, minimax regret, Bayes, mixed (LP).
ALL parameters labeled ASSUMPTION; results = consequences of assumptions, not field facts. Check --sensitivity.
"""
import argparse
import numpy as np
from scipy.stats import beta as Beta, binom, poisson
from scipy.optimize import linprog

T, HPW, SENDS = 12, 10.0, 25          # weeks, work hours/week, sends/week (DAILY_CAP=5 x 5 days)
Q_FLOOR = 0.012                        # breakeven positive-reply per send (previous OOS model)
HOURS = {"S": 8, "E": 14, "D": 12, "R": 20, "Q": 18, "B": 6, "RW": 110}   # ASSUMED nominal hours
NAME = {"S": "Security", "E": "Proof report + methodology", "D": "UI/UX + demo + a11y", "R": "Refactor + tests",
        "Q": "Persistent backend", "B": "Bright Data fallback", "RW": "Complete rewrite"}
KILL_P = 0.50                          # invest only if P(q >= floor) >= 50% after week 5 (scarce data -> kill)
STRATS = {"STOP": [], "NOOP": [], "S": ["S"], "S+E": ["S", "E"], "S+E+D": ["S", "E", "D"],
          "FULL": ["S", "E", "D", "R", "Q", "B"], "REBUILD": ["RW"], "VALIDATE": ["S"]}
SCEN = {  # "nature" scenarios (multipliers); ASSUMPTION
    "base": {}, "weak": {"p": .4}, "strong": {"p": 1.8}, "badrep": {"strike": 3, "p": .8},
    "attack": {"inc": 5}, "crowded": {"p": .5, "close": .7}, "slow": {"hours": 1.8}, "highopp": {"ch": 3}}
BAYES_W = dict(base=.35, weak=.15, strong=.08, badrep=.1, attack=.08, crowded=.1, slow=.08, highopp=.06)


def simulate(strat, sc="base", N=20000, seed=7, ov=None):
    ov = ov or {}
    m = {"p": 1, "close": 1, "strike": 1, "inc": 1, "out": 1, "hours": 1, "ch": 1, **SCEN[sc], **ov.get("sc", {})}
    rng = np.random.default_rng(seed)
    p0 = np.clip(rng.beta(5, 95, N) * m["p"], 0, .5)
    close = np.clip(rng.beta(4, 16, N) * m["close"], 0, 1)
    r = rng.beta(5, 15, N)
    ch = rng.lognormal(np.log(ov.get("ch_med", .015)), .5, N) * m["ch"]
    hm = rng.lognormal(np.log(1.2), .35, (len(HOURS), N)) * m["hours"]     # planning fallacy
    effE = rng.lognormal(np.log(ov.get("E_med", 1.5)), .35, N)
    effD, effRW = rng.lognormal(np.log(1.12), .2, N), rng.lognormal(np.log(1.10), .2, N)
    u = rng.random((5, T + 1, N))
    idx = {k: i for i, k in enumerate(HOURS)}
    hrs = lambda o: HOURS[o] * hm[idx[o]]

    def schedule(order, start):                      # completion time (absolute hours) for each option, sequential
        t, out = start, {}
        for o in order:
            t = t + hrs(o) * (0.8 if (o != "R" and "R" in done_before) else 1.0)
            out[o] = t
        return out
    done_before = set()
    order = STRATS[strat]
    if "R" in order and order.index("R") < len(order):
        done_before = set()                          # R reduces cost of subsequent options; order S,E,D,R,Q,B -> simple: no discount
    comp = schedule(order, np.zeros(N))
    alive, killed, halt = np.ones(N, bool), (np.ones(N, bool) if strat == "STOP" else np.zeros(N, bool)), np.zeros(N)
    strikes = np.zeros(N)
    deals = sends = inc_n = 0
    pos_cum = sent_cum = np.zeros(N)
    ruin = np.zeros(N, bool)
    for w in range(1, T + 1):
        if strat == "VALIDATE" and w == 6:           # decision: invest or kill
            x, n = pos_cum, np.maximum(sent_cum, 1)
            P = Beta.sf(Q_FLOOR, 1 + x, 1 + n - x)
            invest = (P >= KILL_P) & alive
            killed = ~invest
            start = np.maximum(comp["S"], 5 * HPW)
            for o, t in schedule(["E", "D"], start).items():
                comp[o] = np.where(invest, t, np.inf)
        done = lambda o: (o in comp) & (comp.get(o, np.inf) <= (w - 1) * HPW) if o in comp else np.zeros(N, bool)
        incident = (u[2, w] < 0.01 * m["inc"] * np.where(done("S"), .1, 1.0)) & (strat != "STOP")
        inc_n = inc_n + incident
        halt = np.where(incident, 3, halt)
        outage = u[3, w] < 0.03 * m["out"] * np.where(done("R"), 1 / 3, 1.0)
        active = alive & ~killed & (halt <= 0) & ~outage
        halt = np.maximum(halt - 1, 0)
        s = SENDS * active
        pm = np.where(done("E"), effE, 1.) * np.where(done("D"), effD, 1.) * np.where(done("RW"), effE * effD * effRW, 1.)
        q = r * np.clip(p0 * pm, 0, .5)
        mu = s * q
        pos = np.where(mu > 0, poisson.ppf(u[0, w], np.maximum(mu, 1e-12)), 0)
        d = np.where(pos > 0, binom.ppf(u[1, w], pos, close), 0)
        lam = s * (r * .001 + (1 - r) * .006) * m["strike"] * np.where(done("E"), .8, 1.)
        strikes = strikes + np.where(lam > 0, poisson.ppf(u[4, w], np.maximum(lam, 1e-12)), 0)
        hit = (strikes >= 2) & alive            # strike budget B=2 (same as previous OOS model)
        ruin |= hit
        alive &= ~hit
        deals, sends = deals + d, sends + s
        pos_cum, sent_cum = pos_cum + pos, sent_cum + s
    build = np.minimum(sum(hrs(o) for o in comp) if comp else np.zeros(N), T * HPW)
    if strat == "VALIDATE":
        build = np.minimum(hrs("S") + np.where(np.isfinite(comp["E"]), hrs("E") + hrs("D"), 0), T * HPW)
    free = np.maximum(T * HPW - build - 30 * inc_n, 0)
    U = deals - .002 * sends + ch * free - ov.get("L", 3.0) * ruin
    return dict(U=U, deals=deals, sends=sends, build=build, free=free, ruin=ruin, inc=inc_n, killed=killed,
                dead=ruin | (inc_n > 0))


def info_gain(n=int(SENDS * 5), N=40000, seed=3):
    rng = np.random.default_rng(seed)
    q = rng.beta(5, 15, N) * np.clip(rng.beta(5, 95, N), 0, .5)
    m, v = q.mean(), q.var(); k = m * (1 - m) / v - 1; a, b = m * k, (1 - m) * k
    x = rng.binomial(n, rng.beta(a, b, N))
    return Beta(a, b).entropy(), Beta(a + x, b + n - x).entropy().mean(), (a, b)


def selftest():
    ok = True
    def chk(name, c, info=""):
        nonlocal ok; ok &= bool(c); print(f"  [{'OK' if c else 'FAIL'}] {name} {info}")
    z = {"sc": {"inc": 0, "out": 0, "strike": 0}, "ch_med": 1e-9}
    r = simulate("NOOP", "base", 30000, 1, z)
    ana = T * SENDS * .25 * .05 * .2
    chk("NOOP deals match analytical", abs(r["deals"].mean() - ana) < 4 * r["deals"].std() / 173, f"(MC={r['deals'].mean():.3f} analytical={ana:.3f})")
    chk("VALIDATE kills when q=0 (hazard off)", simulate("VALIDATE", "base", 5000, 2, {"sc": {"p": 0, "inc": 0, "out": 0, "strike": 0}})["killed"].mean() > .99)
    chk("VALIDATE does not kill when q is high", simulate("VALIDATE", "base", 5000, 2, {"sc": {"p": 6, "inc": 0, "out": 0, "strike": 0}})["killed"].mean() < .2)
    st = simulate("STOP", "base", 2000, 4)
    chk("STOP: no sends, full free hours", st["sends"].sum() == 0 and st["deals"].sum() == 0 and (st["free"] == T * HPW).all())
    chk("same seed -> identical results", np.array_equal(simulate("S+E", "base", 3000, 5)["U"], simulate("S+E", "base", 3000, 5)["U"]))
    h = simulate("FULL", "slow", 3000, 6)
    chk("hours: build+free+incident <= budget", (h["build"] + h["free"] <= T * HPW + 1e-6).all())
    lo = simulate("S+E", "base", 30000, 7, {"E_med": 1.0})["U"].mean(); hi = simulate("S+E", "base", 30000, 7, {"E_med": 3.0})["U"].mean()
    chk("larger proof effect -> EV increases", hi > lo, f"({lo:.3f} -> {hi:.3f})")
    return ok


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--paths", type=int, default=20000)
    ap.add_argument("--sensitivity", action="store_true"); ap.add_argument("--skip-selftest", action="store_true")
    a = ap.parse_args(); N = a.paths
    if not a.skip_selftest:
        print("SELFTEST"); assert selftest()
    res = {(s, k): simulate(s, k, N) for s in STRATS for k in SCEN}
    base = {s: res[(s, "base")] for s in STRATS}
    print("\nBASE SCENARIO (unit D = 1 client; free hours valued at opportunity cost)")
    print(f"{'strategy':<10}{'EV':>8}{'dEV/NOOP':>10}{'dEV/STOP':>10}{'P(d>0)':>8}{'CVaR5 d':>9}{'P(dead)':>9}{'build hrs':>10}{'deals':>7}")
    for s in STRATS:
        d = base[s]["U"] - base["NOOP"]["U"]; lo = np.sort(d)[: N // 20]
        print(f"{s:<10}{base[s]['U'].mean():8.3f}{d.mean():10.3f}{(base[s]['U'] - base['STOP']['U']).mean():10.3f}{(d > 0).mean():8.1%}{lo.mean():9.3f}"
              f"{base[s]['dead'].mean():9.1%}{base[s]['build'].mean():10.1f}{base[s]['deals'].mean():7.2f}")
    print(f"  VALIDATE: killed at week 6 on {base['VALIDATE']['killed'].mean():.0%} of paths (base)")
    S, K = list(STRATS), list(SCEN)
    U = np.array([[res[(s, k)]["U"].mean() for s in S] for k in K])
    print("\nSTRATEGY x SCENARIO EV MATRIX"); print(f"{'':9}" + "".join(f"{s:>10}" for s in S))
    for i, k in enumerate(K):
        print(f"{k:<9}" + "".join(f"{U[i, j]:10.3f}" for j in range(len(S))) + f"   best: {S[int(U[i].argmax())]}")
    w = np.array([BAYES_W[k] for k in K])
    print("\nGAME THEORY: Bayes =", S[int(np.argmax(w @ U))], "| Maximin =", S[int(np.argmax(U.min(0)))],
          "| Minimax regret =", S[int(np.argmin((U.max(1, keepdims=True) - U).max(0)))])
    J = len(S); A = np.hstack([-U, np.ones((len(K), 1))])
    lp = linprog([0] * J + [-1], A_ub=A, b_ub=np.zeros(len(K)), A_eq=[[1] * J + [0]], b_eq=[1], bounds=[(0, 1)] * J + [(None, None)])
    print("  Maximin mixture:", {s: round(float(x), 3) for s, x in zip(S, lp.x[:J]) if x > 1e-3})
    h0, h1, (aa, bb) = info_gain()
    print(f"\nENTROPY: H(q) prior={h0:.2f} nats -> average posterior after {SENDS*5} sends={h1:.2f} (drop of {h0-h1:.2f} nats = {(h0-h1)/np.log(2):.2f} bits)")
    if a.sensitivity:
        print("\nSENSITIVITY dEV(S+E vs S) and dEV(VALIDATE vs NOOP)")
        for lab, ov in [("opportunity-cost/hr x0.33", {"ch_med": .005}), ("base 0.015 D/hr", {}), ("x3", {"ch_med": .045}), ("x10", {"ch_med": .15})]:
            f = lambda s: simulate(s, "base", N, 7, ov)["U"].mean()
            print(f"  {lab:<26} S+E-S={f('S+E')-f('S'):+.3f}  VALIDATE-NOOP={f('VALIDATE')-f('NOOP'):+.3f}  FULL-NOOP={f('FULL')-f('NOOP'):+.3f}  REBUILD-NOOP={f('REBUILD')-f('NOOP'):+.3f}")
        print("\nDECISION MAP: best strategy (dEV vs STOP) by hourly opportunity cost (D/hr) x loss if sender dies L (D)")
        for L in (0.1, 0.3, 1.0, 3.0):
            row = []
            for chm in (0.001, 0.003, 0.006, 0.015):
                ev = {t: simulate(t, "base", N // 2, 7, {"ch_med": chm, "L": L})["U"].mean() for t in STRATS}
                b = max(ev, key=ev.get); row.append(f"{b}({ev[b]-ev['STOP']:+.2f})")
            print(f"  L={L:<4}" + "".join(f"{x:>16}" for x in row))
        print("  columns: c_h = 0.001 | 0.003 | 0.006 | 0.015")
        for em in (1.0, 1.25, 1.5, 2.0):
            f = lambda s: simulate(s, "base", N, 7, {"E_med": em})["U"].mean()
            print(f"  proof effect on reply x{em:<5}  S+E-S={f('S+E')-f('S'):+.3f}")


if __name__ == "__main__":
    main()
