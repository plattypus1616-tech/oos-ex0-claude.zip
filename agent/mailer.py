"""SMTP/IMAP Gmail (app password). Note: Personal Gmail does NOT report spam complaints to the sender;
available proxies = hard bounce + 'stop/spam' replies."""
import email, imaplib, os, re, smtplib, datetime as dt
from email import policy
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from . import shopify

def configured():
    return bool(os.getenv("GMAIL_USER") and os.getenv("GMAIL_APP_PASSWORD"))

def footer():
    name = os.getenv("SENDER_NAME", "")
    addr = os.getenv("SENDER_ADDRESS", "")
    return f"\n\n--\n{name}\n{addr}\nNot relevant? Just reply \"stop\" and I won't email again."

def send_email(to, subject, body):
    user = os.getenv("GMAIL_USER")
    m = EmailMessage()
    m["From"] = f'{os.getenv("SENDER_NAME", "")} <{user}>'
    m["To"] = to
    m["Subject"] = subject
    m["Message-ID"] = make_msgid(domain=user.split("@")[1])
    m["List-Unsubscribe"] = f"<mailto:{user}?subject=unsubscribe>"
    m.set_content(body + footer())
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(user, os.getenv("GMAIL_APP_PASSWORD"))
        s.send_message(m)
    return m["Message-ID"]

def fetch_recent(days=10):
    out = []
    M = imaplib.IMAP4_SSL("imap.gmail.com")
    M.login(os.getenv("GMAIL_USER"), os.getenv("GMAIL_APP_PASSWORD"))
    M.select("INBOX", readonly=True)
    since = (dt.date.today() - dt.timedelta(days=days)).strftime("%d-%b-%Y")
    _, data = M.search(None, "SINCE", since)
    for num in data[0].split():
        _, raw = M.fetch(num, "(RFC822)")
        out.append(parse_inbound(raw[0][1]))
    M.logout()
    return out

def parse_inbound(raw):
    msg = email.message_from_bytes(raw, policy=policy.default)
    body_part = msg.get_body(preferencelist=("plain",))
    text = body_part.get_content() if body_part else ""
    sender = parseaddr(msg.get("From", ""))[1].lower()
    subj = msg.get("Subject", "")
    is_bounce = bool(re.search(r"mailer-daemon|postmaster", sender)) or bool(
        re.search(r"delivery status|undeliverable|returned mail|failure notice", subj, re.I))
    refs = (msg.get("In-Reply-To", "") + " " + msg.get("References", "")).split()
    return {"id": msg.get("Message-ID", ""), "from": sender, "subject": subj, "text": text,
            "date": str(msg.get("Date", "")), "refs": refs, "is_bounce": is_bounce,
            "hard": bool(re.search(r"\b5\.\d\.\d+\b|\b55\d\b", text)),
            "emails": [e.lower() for e in shopify.EMAIL_RE.findall(text)]}

# ---- reply classification (heuristics; order matters)
RULES = [
    ("complaint", r"\b(spam|report(ed)? you|illegal|harass\w*)\b"),
    ("unsubscribe", r"\b(unsubscribe|remove me|take me off|do not (contact|email)|stop (emailing|email|sending|contacting))\b"),
    ("auto", r"(out of office|auto-?reply|automatic reply|on vacation|away from)"),
    ("negative", r"(not interested|no thanks|no thank you|not a fit|already (have|use|using)|we don'?t need)"),
    ("positive", r"(interested|tell me more|sounds good|let'?s (chat|talk|connect)|send (me )?(more|details|info)|how much|pricing|demo|happy to)"),
]

def classify_text(text):
    lines = [l for l in text.splitlines() if not l.strip().startswith(">")]
    cut = next((i for i, l in enumerate(lines) if re.match(r"\s*On .* wrote:", l)), len(lines))
    t = " ".join(lines[:cut]).lower()
    if t.strip().startswith("stop"):
        return "unsubscribe"
    for label, pat in RULES:
        if re.search(pat, t):
            return label
    return "other"
