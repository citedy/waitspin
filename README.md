# WaitSpin Public Client

This is the curated public source and trust-boundary repository for WaitSpin
client surfaces. The private product/backend repository remains private.

Included:

- npm CLI client source under `packages/waitspin`
- public agent skill under `waitspin-skill/SKILL.md`
- VS Code extension source under `extensions/waitspin-vscode`
- public publisher-surface assets, including Grok Code CLI public target code
- OpenAPI JSON, agents.md/llms.txt sources, trust/privacy/terms page copies
- provenance manifest and public trust-boundary tests

Not included:

- hosted backend implementation
- Stripe webhook internals
- fraud/risk/payout policies and operator controls
- database schema/migrations
- VPS, Cloudflare, monitoring, launch evidence, runbooks, and secrets

License: AGPL-3.0-or-later for the published client/trust code only. Citedy
operates a proprietary hosted backend that is not part of this public client
license.

Agent skill install:

```bash
npx skills add citedy/waitspin --skill waitspin -g -y
npx skills add citedy/waitspin --skill waitspin -a '*' -g -y
npx skills use citedy/waitspin@waitspin
```
