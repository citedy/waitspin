import { formatPublisherRevenueSharePercentWords } from "@/lib/waitspin/billing";
import { waitSpinWebMcpToolListMarkdown } from "@/lib/waitspin/webmcp/tool-definitions";

const publisherShareWords = formatPublisherRevenueSharePercentWords();

const llmsText = `# WaitSpin

WaitSpin is an agent-first ad marketplace for developer wait-states. Advertisers create short sponsored lines with the waitspin CLI, buy prepaid 1,000-impression blocks through Stripe Checkout, and appear in the public market when campaigns are active. Users install verified earning surfaces for VS Code, Claude Code, MiMo Code, OpenCode, or Grok Code CLI and can earn a ${publisherShareWords} share when a sponsored wait-state message is visible for at least 5 seconds.

## Canonical URLs

- Human launch page: https://waitspin.com
- API and agent docs: https://waitspin.com/docs
- Terms: https://waitspin.com/waitspin/terms
- Privacy: https://waitspin.com/waitspin/privacy
- Trust boundary: https://waitspin.com/waitspin/trust
- Public client source: https://github.com/citedy/waitspin
- Public agent skill: https://github.com/citedy/waitspin/blob/main/waitspin-skill/SKILL.md
- Agent contract: https://waitspin.com/.well-known/agents.md
- WaitSpin agent contract mirror: https://waitspin.com/waitspin/agents.md
- VS Code Marketplace extension: https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode
- REST API discovery: https://api.waitspin.com/v1
- OpenAPI contract: https://waitspin.com/openapi/waitspin-api.openapi.json

## Shipped Public Scope

- npm CLI: npx waitspin
- REST API discovery: https://api.waitspin.com/v1
- OpenAPI: https://waitspin.com/openapi/waitspin-api.openapi.json
- Public market: GET /v1/market
- Verified user earning surfaces: VS Code Activity Bar/status-bar extension, Claude Code statusline command, MiMo Code shell hook, OpenCode TUI plugin slot, Grok Code CLI footer
- VS Code install path: code --install-extension waitspin.waitspin-vscode, then run WaitSpin: Connect and earn inside VS Code. CLI fallback: waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY
- Advanced agent install: waitspin install --all --dry-run --compose-existing, waitspin install --all --compose-existing, waitspin status --all
- Agent skill install: npx skills add citedy/waitspin --skill waitspin -g -y
- Guarded wallet, ledger, Connect onboarding, and payout routes
- Privacy boundary: public clients do not read or send workspace files, source code, editor text, prompts, model responses, terminal output, shell history, repository URLs, screenshots, clipboard contents, or raw keystrokes.

## WebMCP Browser Tools

Registered on https://waitspin.com and https://waitspin.com/docs.

${waitSpinWebMcpToolListMarkdown()}

## Not Shipped Public Scope

- Native spinner patching beyond supported status surfaces
- Click billing
- Self-serve cash refunds or account-credit redemption
- Geo targeting

## Agent Skill Distribution

Install the public WaitSpin agent skill with:

\`\`\`bash
npx skills add citedy/waitspin --skill waitspin -g -y
npx skills add citedy/waitspin --skill waitspin -a '*' -g -y
npx skills use citedy/waitspin@waitspin
\`\`\`
`;

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
