"""Telegram: daily report to mobile + commands from mobile (add <domain> | pause | resume). Free."""
import os, requests

def _api(method, **params):
    tok = os.getenv("TELEGRAM_TOKEN")
    if not tok:
        return None
    try:
        return requests.post(f"https://api.telegram.org/bot{tok}/{method}", json=params, timeout=15).json()
    except requests.RequestException:
        return None

def send(text):
    chat = os.getenv("TELEGRAM_CHAT_ID")
    if chat:
        _api("sendMessage", chat_id=chat, text=text[:3900])

def pull_commands(offset):
    """Return (commands, new_offset). Only messages from TELEGRAM_CHAT_ID are accepted."""
    chat = str(os.getenv("TELEGRAM_CHAT_ID", ""))
    res = _api("getUpdates", offset=offset, timeout=0)
    cmds, new = [], offset
    for u in (res or {}).get("result", []):
        new = max(new, u["update_id"] + 1)
        m = u.get("message") or {}
        if str(m.get("chat", {}).get("id")) == chat and m.get("text"):
            cmds.append(m["text"].strip())
    return cmds, new
