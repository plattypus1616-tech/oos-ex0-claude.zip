| Area | Change | File |
|---|---|---|
| Security | All store fetches routed through `safeFetch`: https only, host must be public (blocks private IPs, localhost, cloud metadata), re-validated redirects, 5 MB size limit | lib/safe-fetch.ts, app/api/audit/route.ts |
| Security | Per-IP rate limiting, same-origin check, body size limit, input length/count limit for `generate-email` | lib/guards.ts, both routes |
| Transparency | Removed loss estimates (price x units/day x 30), fallback price of 45, and "Estimated Potential Missed Sales" from email prompt; CSV columns and UI labels removed accordingly | route.ts, generate-email/route.ts, VisualTriageZone.tsx, types.ts |
| Data quality | Contacts picked by ranking (direct > generic) and domain match required; previously the first email passing filter was picked | lib/contacts.ts |
| Accessibility | 63 instances of 9-11px text raised to 12px (text-xs) | app/, components/ |
| Configuration | Gemini model name read from `GEMINI_MODEL` env | both routes |
| Free automation | `agent/` + GitHub Actions: audit -> model -> draft -> send (daily cap) -> read replies -> new policy; reports and control via Telegram | agent/, .github/workflows/agent.yml |
| Model | `agent/policy.py` updates posterior from real outcomes then Monte Carlo selects TOP15/30/60 or SKIP | agent/policy.py, agent/model.py, model/ |

## Pending Work
- Sweep `aria-label` across icon buttons, split `page.tsx` (692 lines) and `StoreAuditCard.tsx` (651 lines).
- Audit logic still exists in 3 places (route.ts, audit_script.py, PythonScriptModal); single source of truth not yet created.
- `trustScore: 94` in fallback email is still hardcoded (generate-email/route.ts) - fabricated number, should be removed.
- In-memory rate limiting per instance; real authentication not yet implemented.
- Redirect/DNS rebinding tested with mocks, not yet with live network.

## Tests
`npm install && npx tsc --noEmit && npm test` and `pip install -r requirements-agent.txt && python -m unittest tests.test_agent`
Free automation setup: see steps in agent/README (secrets GEMINI_API_KEY, GMAIL_*, TELEGRAM_*; MODE=dry first).
