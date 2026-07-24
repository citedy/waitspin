import { formatPublisherRevenueSharePercentWords } from "@/lib/waitspin/billing";
import { waitSpinWebMcpToolListMarkdown } from "@/lib/waitspin/webmcp/tool-definitions";

const publisherShareWords = formatPublisherRevenueSharePercentWords();

const llmsText = `# WaitSpin

WaitSpin is an agent-first ad marketplace for developer wait-states. Advertisers create short sponsored lines with the waitspin CLI, buy prepaid 1,000-impression blocks through Stripe Checkout, and appear in the public market when campaigns are active. Users install verified earning surfaces for VS Code, the VS Code-compatible Cursor editor, the VS Code-compatible Devin Desktop editor, Claude Code, Antigravity CLI, GitHub Copilot CLI, MiMo Code, OpenCode, Grok Code CLI, or Qoder CLI and can earn a ${publisherShareWords} share when a sponsored wait-state message is visible for at least 5 seconds.

## Canonical URLs

- Human launch page: https://waitspin.com
- API and agent docs: https://waitspin.com/docs
- Agent quickstart Markdown: https://waitspin.com/quickstart.md
- Terms: https://waitspin.com/waitspin/terms
- Privacy: https://waitspin.com/waitspin/privacy
- Trust boundary: https://waitspin.com/waitspin/trust
- Public client source: https://github.com/citedy/waitspin
- Public agent skill: https://github.com/citedy/waitspin/blob/main/skills/waitspin/SKILL.md
- Agent contract: https://waitspin.com/.well-known/agents.md
- WaitSpin agent contract mirror: https://waitspin.com/waitspin/agents.md
- VS Code Marketplace extension: https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode
- Open VSX extension for Devin Desktop: https://open-vsx.org/extension/waitspin/waitspin-vscode
- REST API discovery: https://api.waitspin.com/v1
- OpenAPI contract: https://waitspin.com/openapi/waitspin-api.openapi.json

## Shipped Public Scope

- npm CLI: npx waitspin
- REST API discovery: https://api.waitspin.com/v1
- OpenAPI: https://waitspin.com/openapi/waitspin-api.openapi.json
- Public market: GET /v1/market
- SDK posture: WaitSpin is CLI-first; Python, Go, and other agents shell out to npx waitspin and parse JSON. No native SDK is required.
- Verified user earning surfaces: VS Code Activity Bar/status-bar extension, VS Code-compatible Cursor editor, VS Code-compatible Devin Desktop editor, Claude Code statusline command, Antigravity CLI statusline command, GitHub Copilot CLI statusline command, MiMo Code shell hook, OpenCode TUI plugin slot, Grok Code CLI footer, Qoder CLI UserPromptSubmit/Stop hooks
- VS Code/Cursor/Devin API target: status-bar-fallback. Cursor Editor Mode and Devin Desktop are editor aliases for the same VS Code-compatible extension path, not separate cursor or devin targets.
- VS Code/Cursor/Devin install path: VS Code uses code --install-extension waitspin.waitspin-vscode; Cursor Editor Mode uses cursor --install-extension waitspin.waitspin-vscode --force or waitspin extension install --target cursor; Devin Desktop uses Open VSX or devin-desktop --install-extension waitspin.waitspin-vscode --force, with waitspin extension install --target devin as the local lifecycle command. On Windows, WaitSpin resolves Cursor command shims and auto-detects %LOCALAPPDATA%\\devin\\bin\\devin.exe. Local status/uninstall commands use waitspin extension status|uninstall --target cursor|devin. Then run WaitSpin: Connect and earn inside the matching editor. VS Code CLI fallback: waitspin extension install --target vscode --api-key KEY_FROM_JSON
- Advanced agent install: waitspin install --all --dry-run --compose-existing, waitspin install --all --compose-existing, waitspin status --all. Detected Cursor and Devin Desktop editors are included and remain local aliases for status-bar-fallback.
- Agent skill install: npx skills add citedy/waitspin
- Guarded wallet, ledger, Connect onboarding, and payout routes
- Privacy boundary: public clients do not send workspace files, source code, editor text, prompts, model responses, terminal output, shell history, repository URLs, screenshots, clipboard contents, or raw keystrokes. Qoder's official hook payload is delivered locally by Qoder and can include prompt or assistant-message fields; the WaitSpin Qoder runtime discards those fields before cache or API work.

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
npx skills add citedy/waitspin
\`\`\`

Skill registry releases are versioned independently from npm package releases:
GitHub Skills/ClawHub currently expose \`v0.1.19\`; the npm CLI package is
\`waitspin@0.1.16\`.
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
