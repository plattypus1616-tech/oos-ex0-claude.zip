"""Model feedback loop: REAL outcomes (sends, positive replies) -> posterior -> Monte Carlo -> policy.
Selects TOP15/TOP30/TOP60/SKIP with the highest EV; SKIP if no strategy yields EV > 0."""
from dataclasses import replace
from . import model

R_SEL = 0.25                 # proportion of relevant emails among those sent (OOS model)
Q_PRIOR = (1.25, 98.75)      # Beta prior: ~1.25% positive replies per send (= model breakeven)
MIN_SENDS = 20               # below this, data is too sparse: use prior (TOP30)

def posterior_reply_rel(sends, positives):
    a, b = Q_PRIOR
    q = (a + positives) / (a + b + sends)
    return min(max(q / R_SEL, 1e-3), 0.5)

def decide(sends, positives, N=4000, seed=7):
    if sends < MIN_SENDS:
        return {"strategy": "TOP30", "quantile": 0.30, "ev": None, "note": f"sends {sends} < {MIN_SENDS}: using prior"}
    p = replace(model.Params(), reply_rel=posterior_reply_rel(sends, positives))
    ev = {s: float(model.summarize(model.simulate(s, p, N, seed))["EV"]) for s in ("SKIP", "TOP15", "TOP30", "TOP60")}
    best = max(ev, key=ev.get)
    return {"strategy": best, "quantile": model.STRATS[best] or 0.0, "ev": ev,
            "note": f"posterior reply_rel={p.reply_rel:.3f} from {positives}/{sends}"}
