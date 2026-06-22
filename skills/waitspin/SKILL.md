---
name: waitspin
description: Use this skill for WaitSpin, the sponsored wait-state ads CLI and API. Trigger when a user wants to create or manage WaitSpin campaigns, buy prepaid impression blocks, inspect the public market, onboard with email OTP keys, install or check earning surfaces for VS Code, Claude Code, MiMo Code, OpenCode, or Grok Code CLI, inspect wallet/ledger/payout status, or reason about WaitSpin public API, trust boundary, privacy, and shipped vs not-shipped capabilities.
license: AGPL-3.0-or-later
---

# WaitSpin

WaitSpin is an agent-first ad marketplace for developer wait-states. Advertisers buy short sponsored lines; users install verified earning surfaces and can earn from visible sponsored wait-state messages.

## Source Of Truth

- Public site: `https://waitspin.com`
- API docs: `https://waitspin.com/docs`
- Agent contract: `https://waitspin.com/.well-known/agents.md`
- Trust boundary: `https://waitspin.com/waitspin/trust`
- Terms: `https://waitspin.com/waitspin/terms`
- Privacy: `https://waitspin.com/waitspin/privacy`
- Public client source: `https://github.com/citedy/waitspin`
- npm package: `waitspin`
- API base: `https://api.waitspin.com`

Before making a claim about current package availability, verify it:

```bash
npm view waitspin version
npx --yes waitspin@latest --help
```

## Operating Rules

- Do not expose API keys in logs, screenshots, source files, shell history snippets, issues, or chat output.
- Use `--key-profile control` for advertiser campaign, checkout, campaign listing, wallet, Connect, and payout commands.
- Use `--key-profile publisher-extension` for earning-surface installs and serve/impression polling.
- Do not use a broad control key for installed earning surfaces.
- Do not claim onboarding is complete until OTP verification returns an API key.
- Do not print API keys or OTP codes back to the user. Use them only in the current command/session or in the target tool's secret store.
- Treat `waitspin wallet payout --confirm-test-transfer` as test-mode only. Do not claim live payouts are enabled unless the user provides fresh operator proof.
- Keep shipped scope honest. Do not advertise native spinner patching beyond supported status surfaces, click billing, geo targeting, self-serve refunds, or self-serve account-credit redemption.
- If a command supports `--json`, prefer it when the caller needs structured data.

## Agent-Led OTP Automation

Use this loop whenever the user asks to register, onboard, create a key, install an earning surface, or gives you an email address for WaitSpin. The agent can complete the flow, but the human must receive the email and provide the 6-digit code.

1. Pick the key profile from intent:
   - `control` for advertiser campaigns, checkout, wallet, Connect, payout readiness, and market management.
   - `publisher-extension` for user earning-surface installs, publisher registration, serve polling, and impression receipts.
2. If the user did not provide an email, ask for the email address before calling the CLI.
3. Request the code with structured output:

```bash
npx --yes waitspin@latest init --email USER_EMAIL --key-profile control --json
npx --yes waitspin@latest init --email USER_EMAIL --key-profile publisher-extension --json
```

4. Confirm the response has `next: "enter_email_code"`. Tell the user exactly: `I sent a 6-digit WaitSpin code to USER_EMAIL. Reply with the code and I will continue.` Then stop and wait for the user.
5. When the user returns the code, verify it with the same email and key profile:

```bash
npx --yes waitspin@latest init --email USER_EMAIL --code CODE_FROM_EMAIL --key-profile control --json
npx --yes waitspin@latest init --email USER_EMAIL --code CODE_FROM_EMAIL --key-profile publisher-extension --json
```

If the host agent cannot safely place the code in argv, use an environment variable for the single command:

```bash
WAITSPIN_VERIFICATION_CODE=CODE_FROM_EMAIL npx --yes waitspin@latest init --email USER_EMAIL --key-profile control --json
```

6. Parse the JSON response. Keep `api_key` secret; do not echo it in chat. If the agent shell does not preserve environment between calls, prefix each follow-up command with `WAITSPIN_API_KEY='KEY_FROM_JSON'`.
7. Continue immediately with the requested workflow. Do not make the user figure out the next command.

For advertiser onboarding after control-key verification:

```bash
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin bid create --line "Short sponsor line" --url https://example.com --price-per-block 500 --blocks 1 --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin bids list --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin bid checkout CAMPAIGN_ID
```

For publisher or user onboarding after publisher-extension verification:

```bash
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin install --all --dry-run --compose-existing --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin install --all --compose-existing --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin status --all --json
```

If the code expired, request one fresh code and repeat the pause. Do not guess, fake, reuse another user's code, ask for mailbox access, or retry repeatedly against rate limits.

## Common Workflows

### Onboard And Create Advertiser Campaigns

Use this path when the user wants to buy wait-state attention.

```bash
npx --yes waitspin@latest init --email you@example.com --key-profile control --json
npx --yes waitspin@latest init --email you@example.com --code CODE_FROM_EMAIL --key-profile control --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin bid create --line "Short sponsor line" --url https://example.com --price-per-block 500 --blocks 1 --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin bids list --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin bid checkout CAMPAIGN_ID
```

Notes:

- `bid create` creates a draft campaign plus pending block purchase.
- Checkout activates prepaid inventory only after Stripe payment succeeds server-side.
- Use HTTPS destination URLs.
- Keep ad lines short, inspectable, and safe for developer tooling surfaces.

### Install User Earning Surfaces

Use this path when the user wants to earn from supported developer wait states.

```bash
npx --yes waitspin@latest init --email you@example.com --key-profile publisher-extension --json
npx --yes waitspin@latest init --email you@example.com --code CODE_FROM_EMAIL --key-profile publisher-extension --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin install --all --dry-run --compose-existing --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin install --all --compose-existing --json
WAITSPIN_API_KEY='KEY_FROM_JSON' waitspin status --all --json
```

Prefer first-class target commands for debugging:

```bash
code --install-extension waitspin.waitspin-vscode
waitspin extension install --target vscode --api-key KEY_FROM_JSON --json
waitspin extension status --target vscode --json

waitspin claude-code install --api-key KEY_FROM_JSON --compose-existing --json
waitspin claude-code status --json

waitspin mimocode install --api-key KEY_FROM_JSON --json
waitspin mimocode status --json

waitspin opencode install --api-key KEY_FROM_JSON --json
waitspin opencode status --json

waitspin grok install --api-key KEY_FROM_JSON --json
waitspin grok status --json
```

Target behavior:

- VS Code: first-class Marketplace extension plus CLI fallback.
- Claude Code: official `statusLine.command`; use `--compose-existing` only when preserving an existing status line.
- MiMo Code: managed bash hook and runtime.
- OpenCode: managed TUI plugin slot.
- Grok Code CLI: managed text-asset footer patch with hash-backed backup and restore.
- Standalone Cline CLI is not a public install target. Cline VS Code extension users are covered by the VS Code target.

### Inspect Wallet, Ledger, And Payout Readiness

```bash
waitspin wallet status --json
waitspin wallet ledger --limit 20 --json
waitspin wallet connect --country US --json
waitspin wallet payout --dry-run --json
```

Interpretation:

- Wallet and ledger commands require a control key with wallet/connect scopes.
- `wallet connect` returns a Stripe Express onboarding link when allowed.
- Dry-run payout output is a readiness preview, not a live transfer.

### Read Public Market And API Discovery

```bash
waitspin market --json
curl -fsS https://api.waitspin.com/v1
curl -fsS https://waitspin.com/openapi/waitspin-api.openapi.json
```

Use `GET /v1/market` for public campaign leaderboard data. Use the OpenAPI document for request and response shapes instead of guessing.

## API Essentials

| Method | Path | Auth | Use |
| --- | --- | --- | --- |
| POST | `/v1/keys/request` | none | Request email OTP |
| POST | `/v1/keys/verify` | none | Verify OTP and receive scoped API key |
| POST | `/v1/list/subscribe` | none | Double opt-in publisher or founding advertiser email updates |
| GET | `/v1/market` | none | Public market leaderboard |
| POST | `/v1/campaigns` | `campaigns:write` | Create campaign draft and pending block purchase |
| GET | `/v1/campaigns` | `campaigns:read` | List account campaigns |
| POST | `/v1/blocks/checkout` | `blocks:purchase` | Create or reuse Stripe Checkout URL |
| POST | `/v1/publishers/register` | `publishers:write` | Register supported user install |
| POST | `/v1/serve/next` | `serve:read` | Fetch next sponsored message or receive 204 |
| POST | `/v1/events/impression` | `events:write` | Record visible impression with receipt |
| GET | `/v1/wallet/status` | `wallet:read` | Read balances, Connect status, and payout eligibility |
| POST | `/v1/wallet/connect` | `connect:manage` | Create or refresh Stripe Express onboarding link |
| GET | `/v1/wallet/ledger` | `wallet:read` | Read delivery, reversal, hold, and payout ledger |
| POST | `/v1/wallet/payouts` | `connect:manage` | Preview or guarded test payout |

## Trust Boundary

WaitSpin public clients measure wait-state ad visibility. They do not read or send workspace files, source code, editor text, prompts, model responses, terminal output, shell history, repository URLs, screenshots, clipboard contents, or raw keystrokes.

Operational payloads are limited to publisher registration, serve polling, impression receipts, wallet/accounting flows, and normal network metadata needed for rate limits, abuse response, fraud controls, and audit logs.

## Failure Handling

- `204` from `/v1/serve/next` means empty inventory; keep the host tool's normal UI.
- Installer conflicts should be resolved target-by-target. Do not overwrite unmanaged local config unless the CLI offers an explicit flag such as `--compose-existing`.
- For package or install claims, verify with a fresh `npx --yes waitspin@latest ...` command rather than relying on a local workspace build.
- For public source or skill publication claims, verify with `npx skills add citedy/waitspin --skill waitspin --list`.
