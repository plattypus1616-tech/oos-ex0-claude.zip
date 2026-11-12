# oos-agent - OOS outreach pipeline, 100% free, zero-click after setup

Daily flow (GitHub Actions): read inbox -> safety gates -> audit new stores -> select TOP-30% (model) ->
draft (Gemini free tier, validated against hallucinated numbers) -> send (daily cap) -> Telegram report.

## One-time setup (mobile/laptop)
1. Create a **PRIVATE** repo on GitHub, upload the contents of this folder (`state/` contains lead data).
2. Gemini API key from AI Studio -> secret `GEMINI_API_KEY`.
3. Dedicated sender Gmail (not primary account), enable 2FA, generate App Password -> secret `GMAIL_USER`, `GMAIL_APP_PASSWORD`.
4. Secret `SENDER_NAME` and `SENDER_ADDRESS` (business mailing address; required in footer).
5. Telegram: chat @BotFather -> /newbot -> secret `TELEGRAM_TOKEN`; message your bot, then visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` -> extract `chat.id` -> secret `TELEGRAM_CHAT_ID`.
6. Settings > Secrets and variables > Actions > Variables: `MODE=dry` (initially), `GEMINI_MODEL` matching AI Studio.
7. Actions > oos-agent > Run workflow (first test). After that it runs automatically Mon-Fri.

## Mobile Control (Telegram)
`add storename.com` | `pause` | `resume`

## Ramp-up stages
- Week 1-2: `MODE=dry`, inspect drafts in `state/leads.csv` + Telegram reports.
- Then `MODE=send`, `DAILY_CAP=5`. Increase gradually only if bounce rate remains low.
- Automatic circuit breakers: complaints >= STRIKE_BUDGET, bounce > 5%, or positive reply calibration (see config.py).

## Local tests (no internet/keys required)
`pip install -r requirements-agent.txt && python -m unittest tests.test_agent`

## Decision model
`python -m agent.model --sensitivity` (Monte Carlo 26 scenarios) | `python -m agent.model --audits state_audits.json`
