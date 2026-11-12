import os

def _f(k, d): return float(os.getenv(k, d))
def _i(k, d): return int(os.getenv(k, d))

MODE = os.getenv("MODE", "dry")                 # dry = do not send anything | send = actually send
DAILY_CAP = _i("DAILY_CAP", 5)                  # max emails/day (new inbox: start small)
AUDIT_PER_RUN = _i("AUDIT_PER_RUN", 15)
PITCH_QUANTILE = _f("PITCH_QUANTILE", 0.30)     # model output: best TOP15-TOP30
MIN_POOL = _i("MIN_POOL", 10)                   # do not pick "top %" from too small of a pool
GENERIC_PENALTY = _f("GENERIC_PENALTY", 0.5)    # scenario M in model: generic contact
STRIKE_BUDGET = _i("STRIKE_BUDGET", 1)          # B=1 (strictest) -> pause on first complaint
BOUNCE_MAX = _f("BOUNCE_MAX", 0.05)             # ASSUMPTION: pause if hard-bounce > 5% (min 10 sends)
POSITIVE_REPLY_FLOOR = _f("POSITIVE_REPLY_FLOOR", 0.012)  # from model breakeven (~1.1-1.4% per send)
CAL_MIN_SENDS = _i("CAL_MIN_SENDS", 60)
CAL_THRESHOLD = _f("CAL_THRESHOLD", 0.10)       # pause if P(rate>=floor) < 10% after >=60 sends
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")  # match with what appears in AI Studio
SEND_DELAY = _f("SEND_DELAY", 45)               # seconds between emails
