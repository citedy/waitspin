/** @jest-environment node */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  WAITSPIN_CONTROL_API_PATHS,
  WAITSPIN_CONTROL_V1_PATHS,
} from "@/lib/waitspin/control-api-hosts";
import {
  renderWaitSpinAgentsMarkdown,
  waitSpinAgentDocsMissingShippedPaths,
} from "@/lib/waitspin/agent-docs";
import {
  formatPlatformRevenueSharePercentWords,
  formatPublisherRevenueSharePercentWords,
  renderPublicCommissionSplitSentence,
  WTS_STRIPE_FEE_POLICY,
} from "@/lib/waitspin/billing";
import { WTS_PUBLISHER_REVENUE_BPS } from "@/lib/waitspin/constants";
import {
  WAITSPIN_WEBMCP_ORIGIN_TRIAL_TOKENS,
  WAITSPIN_WEBMCP_TOOLS,
} from "@/lib/waitspin/webmcp/tool-definitions";
import {
  WAITSPIN_NEVER_SENT_DATA,
  WAITSPIN_PRIVATE_BOUNDARY,
  WAITSPIN_PUBLIC_TARGET_IDS,
  WAITSPIN_PUBLIC_TRUST_REPO_URL,
  WAITSPIN_SENT_PAYLOADS,
} from "@/lib/waitspin/public-trust";
import { WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY } from "@/lib/waitspin/public-publisher-policy-copy";

describe("WaitSpin public docs contract", () => {
  const repoRoot = process.cwd();

  it("renders public browser pages dynamically under nonce CSP", async () => {
    const nonceProtectedPages = [
      "app/page.tsx",
      "app/waitspin/page.tsx",
      "app/waitspin/account/page.tsx",
      "app/docs/page.tsx",
      "app/waitspin/docs/page.tsx",
      "app/waitspin/privacy/page.tsx",
      "app/waitspin/support/page.tsx",
      "app/waitspin/support/voice/page.tsx",
      "app/waitspin/terms/page.tsx",
      "app/waitspin/trust/page.tsx",
      "app/wallet/connect/page.tsx",
    ];

    await Promise.all(
      nonceProtectedPages.map(async (pagePath) => {
        const source = await readFile(path.join(repoRoot, pagePath), "utf8");
        expect(source).toContain('export const dynamic = "force-dynamic";');
      }),
    );
  });

  it("publishes agents.md from the shipped route allowlist", async () => {
    const markdown = renderWaitSpinAgentsMarkdown();

    expect(waitSpinAgentDocsMissingShippedPaths()).toEqual([]);
    for (const routePath of [
      ...WAITSPIN_CONTROL_V1_PATHS,
      ...WAITSPIN_CONTROL_API_PATHS,
    ]) {
      expect(markdown).toContain(`\`${routePath}\``);
    }
    expect(markdown).toContain("publisher-extension");
    expect(markdown).toContain("wts_demo_agent_quickstart");
    expect(markdown).toContain("npx --yes waitspin market --demo --json");
    expect(markdown).toContain(
      "npx --yes waitspin bid checkout demo_campaign_001 --demo --json",
    );
    expect(markdown).toContain("npx --yes waitspin status --all --demo --json");
    expect(markdown).toContain("`/v1/blocks/mpp-crypto`");
    expect(markdown).toContain("402 Payment Required");
    expect(markdown).toContain("Stripe/Tempo MPP");
    expect(markdown).toContain("PaymentIntent.status");
    expect(markdown).toContain("not a publisher crypto payout");
    expect(markdown).toContain("VS Code Activity Bar/status-bar extension");
    expect(markdown).toContain("Cursor Editor Mode");
    expect(markdown).toContain("Devin Desktop");
    expect(markdown).toContain(
      "devin-desktop --install-extension waitspin.waitspin-vscode",
    );
    expect(markdown).toContain("Claude Code statusline");
    expect(markdown).toContain("MiMo Code shell hook");
    expect(markdown).toContain("OpenCode TUI plugin");
    expect(markdown).toContain("Grok Code CLI footer");
    expect(markdown).toContain("waitspin grok install");
    expect(markdown).toContain("Qoder CLI UserPromptSubmit/Stop hooks");
    expect(markdown).toContain("waitspin qoder install");
    expect(markdown).toContain("Cline CLI awaits");
    expect(markdown).not.toContain("Kilo CLI");
    expect(markdown).toContain("waitspin install --all --dry-run");
    expect(markdown).toContain("waitspin status --all");
    expect(markdown).toContain("## Crypto MPP Block Purchases");
    expect(markdown).toContain("`POST /v1/blocks/mpp-crypto`");
    expect(markdown).toContain("`402 Payment Required`");
    expect(markdown).toContain("`WWW-Authenticate: Payment ...`");
    expect(markdown).toContain("`PaymentIntent` is `succeeded`");
    expect(markdown).toContain("publishers continue to receive standard");
    expect(markdown).toContain(
      "waitspin claude-code install --api-key wts_live_... --compose-existing",
    );
    expect(markdown).toContain("waitspin antigravity install");
    expect(markdown).toContain("waitspin copilot install");
    expect(markdown).toContain("waitspin qoder install");
    expect(markdown).not.toContain("waitspin kilo");
    expect(markdown).toContain("`POST /v1/events/click`");
    expect(markdown).not.toContain("| POST | `/v1/events/click` |");
    expect(markdown).toContain("## WebMCP Browser Tools");
    for (const tool of WAITSPIN_WEBMCP_TOOLS) {
      expect(markdown).toContain(`\`${tool.toolName}\``);
    }

    const [{ GET: wellKnownAgents }, { GET: waitspinAgents }] =
      await Promise.all([
        import("@/app/.well-known/agents.md/route"),
        import("@/app/waitspin/agents.md/route"),
      ]);
    for (const get of [wellKnownAgents, waitspinAgents]) {
      const response = get();
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/markdown");
      await expect(response.text()).resolves.toContain(
        "# WaitSpin Agent Contract",
      );
    }
  });

  it("publishes a WaitSpin-native support page contract", async () => {
    const [
      supportPage,
      supportClient,
      supportVoicePage,
      supportVoiceRedirectPage,
      supportVoiceClient,
      turnstileClient,
      supportRoute,
      supportVoiceSessionRoute,
      supportVoiceConfig,
      nginxConfig,
      cloudflareConfig,
      startScript,
      vpsEnvExample,
    ] = await Promise.all([
      readFile(path.join(repoRoot, "app/waitspin/support/page.tsx"), "utf8"),
      readFile(
        path.join(repoRoot, "app/waitspin/support/WaitSpinSupportClient.tsx"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "app/waitspin/support/voice/page.tsx"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "app/waitspin/support/voice-demo/page.tsx"),
        "utf8",
      ),
      readFile(
        path.join(
          repoRoot,
          "app/waitspin/support/voice/WaitSpinSupportVoiceClient.tsx",
        ),
        "utf8",
      ),
      readFile(path.join(repoRoot, "app/waitspin/WaitSpinTurnstile.tsx"), "utf8"),
      readFile(
        path.join(repoRoot, "app/api/waitspin/support/route.ts"),
        "utf8",
      ),
      readFile(
        path.join(
          repoRoot,
          "app/api/waitspin/support/voice/session/route.ts",
        ),
        "utf8",
      ),
      readFile(path.join(repoRoot, "lib/waitspin/xai-voice.ts"), "utf8"),
      readFile(
        path.join(repoRoot, "infra/waitspin-vps/nginx/default.conf"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "infra/waitspin-vps/nginx/cloudflare-only.conf"),
        "utf8",
      ),
      readFile(path.join(repoRoot, "infra/waitspin-vps/start.mjs"), "utf8"),
      readFile(path.join(repoRoot, "infra/waitspin-vps/.env.example"), "utf8"),
    ]);

    for (const source of [
      supportPage,
      supportClient,
      supportVoicePage,
      supportVoiceRedirectPage,
      supportVoiceClient,
      supportRoute,
      supportVoiceSessionRoute,
      supportVoiceConfig,
    ]) {
      expect(source).toContain("WaitSpin");
      expect(source).not.toContain("adclaw_host");
      expect(source).not.toContain("adclaw_public_site");
    }
    expect(supportPage).toContain("waitspin-page");
    expect(supportClient).toContain("placements");
    expect(supportClient).toContain("payouts");
    expect(supportClient).toContain("crypto MPP payments");
    expect(supportClient).toContain("PaymentIntent");
    expect(supportClient).toContain("technical");
    expect(supportClient).toContain("abuse");
    expect(supportRoute).toContain("waitspin_public_site");
    expect(supportRoute).toContain("WAITSPIN_CITEDY_SUPPORT_SECRET");
    expect(supportRoute).toContain("WAITSPIN_SUPPORT_REQUIRE_TURNSTILE");
    expect(supportClient).toContain("useWaitSpinTurnstile");
    expect(supportPage).toContain("/waitspin/support/voice");
    expect(supportPage).not.toContain("voice demo");
    expect(supportVoicePage).toContain("WaitSpinSupportVoiceClient");
    expect(supportVoicePage).not.toContain("Demo");
    expect(supportVoiceRedirectPage).toContain("/waitspin/support/voice");
    expect(supportVoiceClient).toContain("xai-client-secret.");
    expect(supportVoiceClient).not.toContain("Demo");
    expect(supportVoiceSessionRoute).toContain("realtime/client_secrets");
    expect(supportVoiceSessionRoute).toContain("readWaitSpinXaiVoiceEnvConfig");
    expect(supportVoiceConfig).toContain("WAITSPIN_XAI_VOICE_MODEL");
    expect(supportVoiceClient).toContain("input_audio_buffer.append");
    expect(supportVoiceClient).toContain(
      'status === "error" && ws?.readyState === WebSocket.OPEN',
    );
    expect(supportVoiceClient).toContain(
      "if (!nextPrompt || !canStartVoiceTurn()) return;",
    );
    expect(supportVoiceClient).toContain(
      "const canToggleMicrophone = canStartTurn || isRecording;",
    );
    expect(supportVoiceClient).toContain("inputStreamRef.current = stream");
    expect(supportVoiceClient).toContain("await ensureAudioContext();");
    expect(supportVoiceSessionRoute).toContain(
      "isWaitSpinSupportVoiceSessionAllowed",
    );
    expect(turnstileClient).toContain("api.js?render=explicit");
    expect(turnstileClient).toContain('execution: "execute"');
    expect(turnstileClient).toContain('appearance: "interaction-only"');
    expect(turnstileClient).toContain("window.turnstile?.execute");
    expect(turnstileClient).toContain("widgetIdRef.current = undefined");
    expect(turnstileClient).toContain('active ? " is-active" : ""');
    expect(turnstileClient).not.toContain('size: "normal"');
    expect(turnstileClient).not.toContain("Complete security check");
    expect(turnstileClient).not.toContain(
      "WAITSPIN_TURNSTILE_CHALLENGE_TIMEOUT_MS",
    );
    expect(turnstileClient).toContain("WAITSPIN_TURNSTILE_SILENT_TIMEOUT_MS");
    expect(turnstileClient).toContain("180_000");
    expect(turnstileClient).not.toMatch(
      /waitspin-support-turnstile[^>]+aria-hidden/,
    );
    const globalsCss = await readFile(
      path.join(repoRoot, "app/globals.css"),
      "utf8",
    );
    expect(globalsCss).toContain(".waitspin-support-turnstile{height:0");
    expect(globalsCss).toContain(".waitspin-support-turnstile.is-active");
    expect(globalsCss).toContain("min-height:72px");
    expect(nginxConfig).toContain("location = /api/waitspin/support");
    expect(nginxConfig).toContain(
      "location = /api/waitspin/support/voice/session",
    );
    expect(nginxConfig).toContain("$http_cf_connecting_ip");
    expect(cloudflareConfig).not.toContain("real_ip_header");
    expect(startScript).toContain("WAITSPIN_CITEDY_SUPPORT_SECRET");
    expect(startScript).toContain("XAI_API_KEY");
    expect(vpsEnvExample).toContain("# XAI_API_KEY");
    expect(startScript).toContain("WAITSPIN_TURNSTILE_SECRET_KEY");
    expect(startScript).toContain("WAITSPIN_MPP_CRYPTO_PURCHASES_ENABLED");
    expect(startScript).toContain("MPP_SECRET_KEY");
    expect(vpsEnvExample).toContain("# MPP_SECRET_KEY");
    expect(vpsEnvExample).toContain(
      "# WAITSPIN_MPP_CRYPTO_PURCHASES_ENABLED=true",
    );
    expect(vpsEnvExample).toContain(
      "# WAITSPIN_MPP_CRYPTO_PURCHASE_RETURN_URL=https://waitspin.com/waitspin/mpp-crypto/return",
    );
  });

  it("keeps account Turnstile mounted before dynamic status copy", async () => {
    const accountLoginForm = await readFile(
      path.join(repoRoot, "app/waitspin/account/WaitSpinAccountLoginForm.tsx"),
      "utf8",
    );
    const turnstileIndex = accountLoginForm.indexOf("{turnstile.node}");
    const statusIndex = accountLoginForm.indexOf("{status ?");

    expect(turnstileIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(-1);
    expect(turnstileIndex).toBeLessThan(statusIndex);
  });

  it("documents WebMCP browser onboarding in shared WaitSpin docs", async () => {
    const sources = await Promise.all([
      readFile(path.join(repoRoot, "docs/waitspin/README.md"), "utf8"),
      readFile(path.join(repoRoot, "docs/waitspin/PUBLIC_API.md"), "utf8"),
      readFile(
        path.join(repoRoot, "docs/waitspin/IMPLEMENTATION_STATUS.md"),
        "utf8",
      ),
    ]);

    for (const source of sources) {
      expect(source).toContain("WebMCP");
      expect(source).toContain("lib/waitspin/webmcp/tool-definitions.ts");
    }
    expect(sources.join("\n")).toContain("get_waitspin_market");
    expect(sources.join("\n")).toContain("register_waitspin_publisher");
    expect(sources.join("\n")).toMatch(/no wildcard/i);
    expect(sources.join("\n")).toMatch(/does.*not.*expose campaign creation/i);
  });

  it("documents publisher-extension key boundaries in markdown and public page", async () => {
    const [markdown, publicPage] = await Promise.all([
      readFile(path.join(repoRoot, "docs/waitspin/PUBLIC_API.md"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/docs/page.tsx"), "utf8"),
    ]);

    for (const source of [markdown, publicPage]) {
      expect(source).toMatch(/Extension(?: API)? keys created with/);
      expect(source).toContain("create campaigns");
      expect(source).toContain("Checkout");
      expect(source).toContain("wallet");
      expect(source).toContain("Connect");
      expect(source).toContain("payouts");
    }
  });

  it("keeps public user install docs scoped to supported target lifecycles", async () => {
    const checkedFiles = [
      "app/waitspin/docs/page.tsx",
      "app/waitspin/waitspin-landing-client.tsx",
      "docs/waitspin/PUBLIC_API.md",
      "skills/waitspin/SKILL.md",
      "packages/waitspin/README.md",
      "packages/waitspin/src/cli.ts",
    ];
    const sources = await Promise.all(
      checkedFiles.map((file) => readFile(path.join(repoRoot, file), "utf8")),
    );
    const publicCopySources = checkedFiles
      .map((file, index) => ({ file, source: sources[index] }))
      .filter(({ file }) => file !== "packages/waitspin/src/cli.ts")
      .map(({ source }) => source)
      .join("\n");

    for (const source of sources) {
      expect(source).toContain("--target vscode");
      expect(source).not.toContain("WaitSpin: Connect publisher");
      expect(source).not.toContain("verified publisher surfaces");
      expect(source).not.toContain("Verified public publisher targets");
      expect(source).not.toMatch(
        /extension install --target (?:claude|codex)/i,
      );
      expect(source).not.toMatch(/--target (?:claude-code|codex)/i);
    }
    expect(sources.join("\n")).toContain("status-bar-fallback");
    expect(sources.join("\n")).toContain("claude-code");
    expect(sources.join("\n")).toContain("waitspin claude-code install");
    expect(sources.join("\n")).toContain("mimocode");
    expect(sources.join("\n")).toContain("waitspin mimocode install");
    expect(sources.join("\n")).toContain("opencode");
    expect(sources.join("\n")).toContain("waitspin opencode install");
    expect(sources.join("\n")).toContain("grok");
    expect(sources.join("\n")).toContain("waitspin grok install");
    expect(sources.join("\n")).toContain("antigravity");
    expect(sources.join("\n")).toContain("waitspin antigravity install");
    expect(sources.join("\n")).toContain("copilot");
    expect(sources.join("\n")).toContain("waitspin copilot install");
    expect(sources.join("\n")).toContain("Cursor Editor Mode");
    expect(sources.join("\n")).toContain(
      "cursor --install-extension waitspin.waitspin-vscode",
    );
    expect(sources.join("\n")).toContain("Devin Desktop");
    expect(sources.join("\n")).toContain(
      "https://open-vsx.org/extension/waitspin/waitspin-vscode",
    );
    expect(sources.join("\n")).toContain(
      "devin-desktop --install-extension waitspin.waitspin-vscode",
    );
    expect(sources.join("\n")).toContain("standalone Cline CLI");
    expect(sources.join("\n")).toContain("waitspin install --all");
    expect(sources.join("\n")).toContain("waitspin status --all");
    expect(sources.join("\n")).toContain("--compose-existing");
    expect(publicCopySources).not.toContain("Kilo CLI");
    expect(publicCopySources).not.toContain("waitspin kilo");
    expect(publicCopySources).not.toMatch(/\bkilo\b/i);
    expect(sources[1]).not.toContain('"target": "cursor"');
    expect(sources[1]).not.toContain("`cursor`");
    expect(sources[0]).not.toContain('"target": "devin"');
    expect(sources[1]).not.toContain('"target": "devin"');
    expect(sources[1]).not.toContain("`devin`");

    const apiTargetSources = (
      await Promise.all(
        [
          "openapi/waitspin-api.openapi.json",
          "public/openapi/waitspin-api.openapi.json",
          "lib/waitspin/generated/openapi.types.ts",
        ].map((file) => readFile(path.join(repoRoot, file), "utf8")),
      )
    ).join("\n");
    expect(apiTargetSources).toContain("status-bar-fallback");
    expect(apiTargetSources).not.toContain("devin");
    expect(apiTargetSources).not.toContain("cursor");
  });

  it("does not advertise an automated account-credit balance before redemption ships", async () => {
    const checkedFiles = [
      "app/waitspin/page.tsx",
      "app/waitspin/docs/page.tsx",
      "app/waitspin/agents.md/route.ts",
      "app/waitspin/terms/page.tsx",
      "app/.well-known/agents.md/route.ts",
      "docs/waitspin/PUBLIC_API.md",
      "docs/waitspin/LEGAL_AND_POLICY.md",
      "docs/waitspin/ARCHITECTURE.md",
      "docs/waitspin/PRD.md",
      "docs/waitspin/IMPLEMENTATION_STATUS.md",
      "docs/waitspin/V2_ROADMAP.md",
      "docs/waitspin/LAUNCH_EXECUTION_PLAN.md",
      "skills/waitspin/SKILL.md",
      "packages/waitspin/README.md",
      "packages/waitspin/src/cli.ts",
    ];
    const [launchClient, ...sources] = await Promise.all([
      readFile(
        path.join(repoRoot, "app/waitspin/waitspin-landing-client.tsx"),
        "utf8",
      ),
      ...checkedFiles.map((file) =>
        readFile(path.join(repoRoot, file), "utf8"),
      ),
    ]);

    expect(launchClient).not.toContain("No automated account-credit balance");
    expect(launchClient).not.toContain("self-serve cash refund request flow");
    for (const source of [launchClient, ...sources]) {
      expect(source).not.toMatch(/unused prepaid blocks are account credit/i);
      expect(source).not.toMatch(/treated as account credit unless/i);
      expect(source).not.toMatch(/unused blocks (?:are|as).*account credit/i);
      expect(source).not.toMatch(/remain as .*account credit/i);
      expect(source).not.toMatch(/MVP = credit only/i);
    }
  });

  it("keeps fraud runbook wording aligned with shipped runtime controls", async () => {
    const [runbook, securityGates, launchBlockers] = await Promise.all([
      readFile(
        path.join(repoRoot, "docs/waitspin/DEPLOYED_PAID_E2E_RUNBOOK.md"),
        "utf8",
      ),
      readFile(path.join(repoRoot, "docs/waitspin/SECURITY_GATES.md"), "utf8"),
      readFile(path.join(repoRoot, "docs/waitspin/LAUNCH_BLOCKERS.md"), "utf8"),
    ]);

    expect(runbook).not.toMatch(/mint unlimited billable impressions/i);
    expect(runbook).not.toMatch(/generate unconstrained billable impressions/i);
    expect(runbook).not.toMatch(/raw scripted publisher calls can bypass/i);
    for (const source of [runbook, securityGates, launchBlockers]) {
      expect(source).toContain("publisher-extension");
      expect(source).toMatch(
        /publisher trust|trusted[- ]publisher|trusted publisher/i,
      );
      expect(source).toContain("velocity");
      expect(source).toMatch(/aggregate (account\/IP|per-account\/IP)/i);
    }
  });

  it("keeps legal pages aligned with guarded wallet and payout surfaces", async () => {
    const [terms, privacy, launchPage] = await Promise.all([
      readFile(path.join(repoRoot, "app/waitspin/terms/page.tsx"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/privacy/page.tsx"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/page.tsx"), "utf8"),
    ]);

    const combined = [terms, privacy, launchPage].join("\n");
    expect(combined).not.toMatch(/until the money-surface work is complete/i);
    expect(combined).not.toMatch(/managed uninstall\/status lifecycle/i);
    expect(combined).not.toMatch(
      /Stripe Connect onboarding, payout execution, earnings APIs, ledger APIs.*not public paid-launch capabilities/i,
    );
    const publisherPolicyCopy = WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY;
    expect(terms).toContain("WAITSPIN_PUBLIC_PUBLISHER_POLICY_COPY");
    expect(terms).toContain("publisherPolicyCopy.trustMinLevelLabel");
    expect(terms).toContain(
      "publisherPolicyCopy.minLevelInstallCampaignCapPercent",
    );
    expect(privacy).toContain("publisherPolicyCopy.earningMaturityHours");
    expect(publisherPolicyCopy.minLevelInstallCampaignCapPercent).toBe("0.5%");
    expect(terms).toContain("/docs#publisher-levels-and-limits");
    expect(terms).toContain("payout policy eligibility checks");
    expect(terms).toContain("does not guarantee that any balance is immediately");
    expect(terms).toContain("withdrawable");
    expect(terms).toContain("responsible for all advertising text");
    expect(terms).toContain("promoted names, brands");
    expect(terms).toContain("permanent account blocking without restoration");
    expect(terms).toContain("without restoration");
    expect(terms).toContain("or refund");
    expect(terms).toContain("disclose available account, campaign");
    expect(terms).toContain("law enforcement");
    expect(combined).not.toMatch(/explicit operator flags/i);
    expect(combined).not.toMatch(/deployed E2E/i);
    expect(combined).not.toMatch(/not public paid-launch capabilities/i);
    expect(privacy).toContain("Money And Payout Data");
    const publicTrustSource = await readFile(
      path.join(repoRoot, "lib/waitspin/public-trust.ts"),
      "utf8",
    );
    expect(publicTrustSource).not.toContain(", etc.");
    expect(publicTrustSource).toMatch(/VS Code\s+SecretStorage/);
    expect(privacy).toContain("/provenance/waitspin-vscode.json");
    expect(privacy).toContain(
      "https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode",
    );
    expect(privacy).toContain("Stripe Connect onboarding");
    expect(privacy).toContain('href="/wallet/connect"');
    expect(terms).toContain("Stripe Connect onboarding");
    expect(terms).toContain('href="/wallet/connect"');
    expect(terms).toContain("crypto MPP API rail");
    expect(terms).toContain("PaymentIntent");
    expect(terms).toContain("does not custody");
    expect(terms).toContain("direct cryptocurrency publisher withdrawals");
    expect(privacy).toContain("WAITSPIN_PUBLIC_PUBLISHER_TARGETS");
    expect(publicTrustSource).toContain("Grok Code CLI");
    expect(publicTrustSource).toContain("Cursor Editor Mode");
    expect(publicTrustSource).toContain(
      "cursor --install-extension waitspin.waitspin-vscode",
    );
    expect(publicTrustSource).toContain("Devin Desktop");
    expect(publicTrustSource).toContain(
      "https://open-vsx.org/extension/waitspin/waitspin-vscode",
    );
    expect(publicTrustSource).toContain(
      "devin-desktop --install-extension waitspin.waitspin-vscode",
    );
    expect(privacy).toContain("no separate analytics telemetry stream");
    expect(privacy).toContain("Devin Desktop");
    expect(privacy).toContain("Open VSX");
    for (const item of WAITSPIN_NEVER_SENT_DATA) {
      expect(publicTrustSource).toContain(item);
    }
    for (const item of WAITSPIN_SENT_PAYLOADS) {
      expect(publicTrustSource).toContain(item);
    }
    expect(launchPage).toContain("Public install contract");
    expect(launchPage).not.toContain("after npm publish");
  });

  it("publishes the public trust boundary and curated export pipeline", async () => {
    const [
      trustPage,
      privacyPage,
      publicTrustSource,
      exportScript,
      publicSyncScript,
      publicSkillScript,
      publicEnvScript,
      publicSyncWorkflow,
      packageJson,
    ] = await Promise.all([
      readFile(path.join(repoRoot, "app/waitspin/trust/page.tsx"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/privacy/page.tsx"), "utf8"),
      readFile(path.join(repoRoot, "lib/waitspin/public-trust.ts"), "utf8"),
      readFile(
        path.join(repoRoot, "scripts/waitspin-public-export.mjs"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "scripts/waitspin-public-sync-check.mjs"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "scripts/waitspin-public-skill-check.mjs"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "scripts/waitspin-public-env.mjs"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, ".github/workflows/waitspin-public-sync.yml"),
        "utf8",
      ),
      readFile(path.join(repoRoot, "package.json"), "utf8"),
    ]);

    for (const source of [trustPage, privacyPage]) {
      expect(source).toMatch(/wait-state ad visibility/i);
      expect(source).toContain("no separate analytics telemetry stream");
      expect(source).toContain("WAITSPIN_PUBLIC_PUBLISHER_TARGETS");
      expect(source).toContain("WAITSPIN_NEVER_SENT_DATA");
      expect(source).toContain("WAITSPIN_SENT_PAYLOADS");
    }
    for (const target of WAITSPIN_PUBLIC_TARGET_IDS) {
      expect(publicTrustSource).toContain(target);
    }
    expect(WAITSPIN_PUBLIC_TARGET_IDS).toContain("status-bar-fallback");
    expect(
      WAITSPIN_PUBLIC_TARGET_IDS.filter(
        (target) => target === "status-bar-fallback",
      ),
    ).toHaveLength(1);
    expect(publicTrustSource).toContain("Devin Desktop");
    expect(publicTrustSource).toContain("Open VSX");
    expect(trustPage).toContain("Devin Desktop");
    expect(trustPage).toContain("Open VSX");
    for (const hiddenTarget of ["kilo"]) {
      expect(publicTrustSource).not.toContain(hiddenTarget);
      expect(exportScript).not.toContain(hiddenTarget);
    }
    for (const item of WAITSPIN_NEVER_SENT_DATA) {
      expect(publicTrustSource).toContain(item);
    }
    for (const item of WAITSPIN_SENT_PAYLOADS) {
      expect(publicTrustSource).toContain(item);
    }
    for (const item of WAITSPIN_PRIVATE_BOUNDARY) {
      expect(publicTrustSource).toContain(item);
    }
    expect(trustPage).toContain("WAITSPIN_PUBLIC_TRUST_REPO_URL");
    expect(publicTrustSource).toContain(WAITSPIN_PUBLIC_TRUST_REPO_URL);
    expect(exportScript).toContain("allowEntries");
    expect(exportScript).toContain("app/wallet/connect/WalletConnectCodeInput.tsx");
    expect(exportScript).toContain("app/wallet/connect/WalletConnectRequestForm.tsx");
    expect(exportScript).toContain("app/waitspin/WaitSpinTurnstile.tsx");
    expect(exportScript).toContain("lib/waitspin/publisher-connect-countries.ts");
    expect(exportScript).toContain("forbiddenPathFragments");
    expect(exportScript).toContain("DATABASE_URL");
    expect(exportScript).toContain("STRIPE_");
    expect(exportScript).toContain("AGPL-3.0-or-later");
    expect(exportScript).toContain("waitspin:trust-boundary");
    expect(exportScript).toContain("skills/waitspin/SKILL.md");
    expect(exportScript).toContain("skills/waitspin/skill-card.md");
    expect(exportScript).toContain("npx skills add citedy/waitspin");
    expect(exportScript).toContain("Cursor Editor Mode: status-bar-fallback");
    expect(exportScript).toContain("Devin Desktop: status-bar-fallback");
    expect(exportScript).toContain(
      "Open VSX-published VS Code-compatible extension",
    );
    expect(exportScript).toContain(
      "devin-desktop --install-extension waitspin.waitspin-vscode",
    );
    expect(exportScript).toContain(
      "Cline, Kimi, MMX, and other experimental native CLI targets are not public targets",
    );
    expect(exportScript).not.toMatch(/\bkilo\b/i);
    expect(packageJson).toContain("waitspin:public-export");
    expect(packageJson).toContain("waitspin:public-export:dry-run");
    expect(packageJson).toContain("waitspin:public-sync:check");
    expect(packageJson).toContain("waitspin:public-skill:check");
    expect(packageJson).toContain("test:waitspin:public-sync");
    expect(packageJson).toContain("test:waitspin:public-skill");
    expect(publicSyncScript).toContain("AbortSignal.timeout");
    expect(publicSyncScript).toContain("publicPackageTimeoutMs = 15_000");
    expect(publicSyncScript).toContain("timeout: execTimeoutMs");
    expect(publicSyncScript).toContain("assertExpectedPublicPackageUrl");
    expect(publicSyncScript).toContain("exportedContentPaths");
    expect(publicSyncScript).toContain("app/llms.txt/route.ts");
    expect(publicSyncScript).toContain("renderLocalLlmsText");
    expect(publicSyncScript).toContain("waitspin.com/llms.txt");
    expect(publicSyncScript).toContain("WAITSPIN_WEBMCP_TOOLS");
    expect(publicSyncScript).toContain("WTS_PUBLISHER_REVENUE_BPS");
    expect(publicSyncScript).toContain("replaceStaticInterpolation");
    expect(publicSyncScript).toContain("parseDoubleQuotedString");
    expect(publicSyncScript).toContain("comparePublicExports");
    expect(publicSyncScript).toContain("GITHUB_EVENT_NAME");
    expect(publicSyncScript).toContain("public_export_comparison_skipped");
    expect(publicSyncScript).toContain("local_sha256");
    expect(publicSyncScript).toContain("public_sha256");
    expect(publicSyncScript).toContain("compareExportedContent");
    expect(publicSyncScript).toContain("compareRenderedContent");
    expect(publicSyncScript).toContain("public repo exported content is stale");
    expect(publicSyncScript).toContain("parsed.name !== \"waitspin\"");
    expect(publicSyncScript).toContain("local_package_matches_npm");
    expect(publicSyncScript).toContain("--allow-local-pending-release");
    expect(publicSyncScript).toContain("local_pending_release_allowed");
    expect(publicSyncScript).toContain("local package version differs from npm latest");
    expect(publicSyncScript).toContain("waitspinPublicChildEnv");
    expect(publicSyncScript).toContain("waitspinPublicGitHubTokenForAuth");
    expect(publicSyncScript).toContain("headers.authorization");
    expect(publicSyncScript).toContain("sourced from exportedContentPaths only");
    expect(publicSyncScript).toContain("waitspinPublicSafeErrorDetail");
    expect(publicSyncScript).toContain("Unexpected content-type from public WaitSpin package metadata");
    expect(publicSyncScript).not.toContain("...process.env");
    expect(publicSyncScript).not.toContain("node:vm");
    expect(publicSyncScript).not.toContain("runInNewContext");
    expect(publicSyncScript).toContain("Unable to read npm latest version");
    expect(publicSkillScript).toContain("v0.1.17");
    expect(publicSkillScript).toContain("clawhub");
    expect(publicSkillScript).toContain("skills@1.5.12");
    expect(publicSkillScript).toContain("clawhub@0.22.0");
    expect(publicSkillScript).toContain("timeout: options.timeoutMs ?? execTimeoutMs");
    expect(publicSkillScript).toContain("registryCliTimeoutMs");
    expect(publicSkillScript).toContain("clawhub_status");
    expect(publicSkillScript).toContain("clawhub_required: true");
    expect(publicSkillScript).toContain("--allow-unpublished-release");
    expect(publicSkillScript).toContain("publication_pending");
    expect(publicSkillScript).toContain("release_check_skipped");
    expect(publicSkillScript).toContain("clawhub_selected_version");
    expect(publicSkillScript).not.toContain("tolerateClawHubOutage");
    expect(publicSkillScript).not.toContain("isTransientClawHubError");
    expect(publicSkillScript).toContain("fetchPublishedSkill");
    expect(publicSkillScript).toContain("publicSkillMainUrl");
    expect(publicSkillScript).toContain("publicSkillReleaseUrl");
    expect(publicSkillScript).toContain("api.github.com");
    expect(publicSkillScript).toContain("application/vnd.github+json");
    expect(publicSkillScript).toContain("Buffer.from");
    expect(publicSyncWorkflow).toContain("--allow-local-pending-release");
    expect(publicSyncWorkflow).toContain("--allow-unpublished-release");
    expect(publicSyncWorkflow).toContain("EVENT_NAME: ${{ github.event_name }}");
    expect(publicSyncWorkflow).toContain('if [ "$EVENT_NAME" = "pull_request" ]');
    expect(publicSkillScript).toContain("local_skill_sha256");
    expect(publicSkillScript).toContain("public_main_skill_sha256");
    expect(publicSkillScript).toContain("public_release_skill_sha256");
    expect(publicSkillScript).toContain("clawhub_skill_sha256");
    expect(publicSkillScript).toContain("clawHubAdvertisedSpec");
    expect(publicSkillScript).toContain("createHash");
    expect(publicSkillScript).toContain("Published WaitSpin skill content is stale");
    expect(publicSkillScript).toContain("waitspinPublicChildEnv");
    expect(publicSkillScript).toContain("includeGitHubToken: true");
    expect(publicSkillScript).toContain("waitspinPublicGitHubTokenForAuth");
    expect(publicSkillScript).toContain("headers.authorization");
    expect(publicSkillScript).toContain("waitspinPublicSafeErrorDetail");
    expect(publicSkillScript).not.toContain("...process.env");
    expect(publicEnvScript).toContain("waitspinPublicChildEnv");
    expect(publicEnvScript).toContain("waitspinPublicGitHubTokenForAuth");
    expect(publicEnvScript).toContain("waitspinPublicSafeErrorDetail");
    expect(publicEnvScript).toContain("typeof value !== \"string\"");
    expect(publicEnvScript).toContain("github_pat_");
    expect(publicEnvScript).toContain("ghs_");
    expect(publicEnvScript).toContain("[A-Za-z0-9_.-]+");
    expect(publicEnvScript).toContain("{1,255}$");
    expect(publicEnvScript).toContain("[redacted-long-token]");
    expect(publicEnvScript).toContain("npm_config_ignore_scripts");
    expect(publicEnvScript).toContain("npm_config_registry");
    expect(publicEnvScript).toContain("npm_config_strict_ssl");
    expect(publicEnvScript).toContain("registry.npmjs.org");
    expect(publicEnvScript).toContain("allowedNpmConfigKeys");
    expect(publicEnvScript).toContain("npm_config_cache");
    expect(publicEnvScript).toContain("npm_config_https_proxy");
    expect(publicEnvScript).toContain("secretNpmConfigPattern");
    expect(publicEnvScript).toContain("userconfig");
    expect(publicEnvScript).toContain("globalconfig");
    expect(publicEnvScript).toContain("strict_ssl");
    expect(publicEnvScript).toContain("cafile");
    expect(publicEnvScript).toContain("!allowedNpmConfigKeys.has(key)");
    expect(publicEnvScript).toContain("parsed.protocol !== \"http:\"");
    expect(publicEnvScript).toContain("parsed.protocol !== \"https:\"");
    expect(publicEnvScript).toContain("GH_TOKEN");
    expect(publicSyncWorkflow).toContain("npm run waitspin:public-skill:check");
    expect(publicSyncWorkflow).toContain("pull_request:");
    expect(publicSyncWorkflow).toContain("permissions:");
    expect(publicSyncWorkflow).toContain("contents: read");
    expect(publicSyncWorkflow).toContain("packages/waitspin/package.json");
    expect(publicSyncWorkflow).toContain("scripts/waitspin-public-env.mjs");
    expect(publicSyncWorkflow).toContain("lib/waitspin/billing.ts");
    expect(publicSyncWorkflow).toContain("lib/waitspin/constants.ts");
    expect(publicSyncWorkflow).toContain("lib/waitspin/webmcp/tool-definitions.ts");
    expect(publicSyncWorkflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(publicSyncWorkflow).toContain(
      "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
    );
    expect(publicSyncWorkflow).toContain("persist-credentials: false");
    expect(publicSyncWorkflow).toContain(
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    );
  });

  it("does not describe public npx install as waiting for npm publication", async () => {
    const checkedFiles = [
      "app/waitspin/page.tsx",
      "app/waitspin/docs/page.tsx",
      "docs/waitspin/PUBLIC_API.md",
      "docs/waitspin/PRD.md",
      "lib/waitspin/agent-docs.ts",
      "packages/waitspin/README.md",
      "skills/waitspin/SKILL.md",
    ];
    const sources = await Promise.all(
      checkedFiles.map((file) => readFile(path.join(repoRoot, file), "utf8")),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/after npm publish/i);
      expect(source).not.toMatch(/quick start after npm publish/i);
      expect(source).not.toMatch(/run this only after/i);
      expect(source).not.toMatch(/distribution gate/i);
      expect(source).not.toMatch(/run only after npm distribution evidence/i);
      expect(source).not.toMatch(
        /run these only after npm distribution evidence/i,
      );
    }
    expect(sources.join("\n")).toContain("WaitSpin: Connect and earn");
    expect(sources.join("\n")).toContain("npm view waitspin version");
  });

  it("keeps the public skill actionable for agent-led email OTP onboarding", async () => {
    const skill = await readFile(
      path.join(repoRoot, "skills/waitspin/SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("## Agent-Led OTP Automation");
    expect(skill).toContain("--key-profile control --json");
    expect(skill).toContain("--key-profile publisher-extension --json");
    expect(skill).toContain("--code 123456");
    expect(skill).toContain("tool-scoped environment variable");
    expect(skill).toContain("WAITSPIN_VERIFICATION_CODE");
    expect(skill).not.toContain('--code "$WAITSPIN_VERIFICATION_CODE"');
    expect(skill).toContain(
      "npx --yes waitspin@0.1.13 init --email you@example.com --key-profile control --json",
    );
    expect(skill).toContain("next: \"enter_email_code\"");
    expect(skill).toContain("Validate user-supplied emails");
    expect(skill).toContain("Reject values containing shell metacharacters");
    expect(skill).toContain("publisher-extension` for earning-surface installs, serve/impression polling, and read-only wallet status/ledger checks");
    expect(skill).toContain("Then stop and wait for the user");
    expect(skill).toContain("Do not print API keys or OTP codes");
    expect(skill).toContain("do not build inline shell assignments");
    expect(skill).toContain("WAITSPIN_API_KEY");
    expect(skill).toContain("Do not pass live API keys in argv with `--api-key`");
    expect(skill).not.toContain("--api-key KEY_FROM_JSON");
    expect(skill).toContain("waitspin bid create");
    expect(skill).toContain("waitspin install --all --dry-run");
    expect(skill).toContain("A `publisher-extension` key is appropriate for publisher earnings reads");
    expect(skill).toContain("do not echo it in chat");
    expect(skill).toContain("npx --yes waitspin@0.1.13");
    expect(skill).not.toContain("waitspin@latest");
    expect(skill).not.toContain("USER_EMAIL");
    expect(skill).not.toContain("CODE_FROM_EMAIL");
    expect(skill).not.toContain("WAITSPIN_API_KEY='KEY_FROM_JSON'");
    expect(skill).not.toContain("PASTE_PUBLISHER_EXTENSION_KEY");
    expect(skill).not.toContain("PASTE_CONTROL_KEY");
  });

  it("publishes SEO and AI discovery surfaces for the launch page", async () => {
    const [
      { WAITSPIN_BRAND_ICON_VERSION, waitspinBrandIcons },
      { default: robots },
      { default: sitemap },
      { GET: llmsTxt },
      { GET: favicon },
      { GET: icon180 },
      { GET: iconSvg },
      { GET: icon32 },
      { GET: icon48 },
      { GET: appleTouchIcon },
      { GET: webMcpOriginTrial },
    ] = await Promise.all([
      import("@/app/waitspin/brand-icons"),
      import("@/app/robots"),
      import("@/app/sitemap"),
      import("@/app/llms.txt/route"),
      import("@/app/favicon.ico/route"),
      import("@/app/icon-180.png/route"),
      import("@/app/icon.svg/route"),
      import("@/app/icon-32.png/route"),
      import("@/app/icon-48.png/route"),
      import("@/app/apple-touch-icon.png/route"),
      import("@/app/waitspin/webmcp-origin-trial.js/route"),
    ]);

    const robotsPolicy = robots();
    expect(robotsPolicy.sitemap).toBe("https://waitspin.com/sitemap.xml");
    expect(JSON.stringify(robotsPolicy.rules)).toContain("GPTBot");
    expect(JSON.stringify(robotsPolicy.rules)).toContain("OAI-SearchBot");
    expect(JSON.stringify(robotsPolicy.rules)).toContain("ClaudeBot");
    expect(JSON.stringify(robotsPolicy.rules)).toContain("PerplexityBot");

    const sitemapUrls = sitemap().map((entry) => entry.url);
    expect(sitemapUrls).toEqual(
      expect.arrayContaining([
        "https://waitspin.com/",
        "https://waitspin.com/docs",
        "https://waitspin.com/wallet/connect",
        "https://waitspin.com/waitspin",
        "https://waitspin.com/waitspin/docs",
        "https://waitspin.com/waitspin/trust",
        "https://waitspin.com/waitspin/terms",
        "https://waitspin.com/waitspin/privacy",
        "https://waitspin.com/.well-known/agents.md",
        "https://waitspin.com/waitspin/agents.md",
      ]),
    );

    const llmsResponse = llmsTxt();
    const llmsBody = await llmsResponse.text();
    expect(llmsBody).toContain("WaitSpin is an agent-first ad marketplace");
    expect(llmsBody).toContain("## WebMCP Browser Tools");
    expect(llmsBody).toContain(
      "Verified user earning surfaces: VS Code Activity Bar/status-bar extension, VS Code-compatible Cursor editor, VS Code-compatible Devin Desktop editor, Claude Code statusline command, Antigravity CLI statusline command, GitHub Copilot CLI statusline command, MiMo Code shell hook, OpenCode TUI plugin slot, Grok Code CLI footer",
    );
    expect(llmsBody).toContain("VS Code/Cursor/Devin install path");
    expect(llmsBody).toContain(
      "Cursor Editor Mode uses cursor --install-extension waitspin.waitspin-vscode",
    );
    expect(llmsBody).toContain(
      "Devin Desktop uses Open VSX or devin-desktop --install-extension waitspin.waitspin-vscode",
    );
    expect(llmsBody).toContain("status-bar-fallback");
    expect(llmsBody).toContain(
      "not separate cursor or devin targets",
    );
    expect(llmsBody).toContain(
      "Advanced agent install: waitspin install --all",
    );
    expect(llmsBody).not.toContain(
      "Verified publisher surface: VS Code status-bar fallback",
    );
    expect(llmsBody).not.toContain("Verified publisher surfaces");
    expect(llmsBody).not.toContain("VS Code status-bar fallback");
    expect(llmsResponse.headers.get("Content-Type")).toContain("text/plain");
    expect(waitspinBrandIcons).toMatchObject({
      apple: [
        {
          sizes: "180x180",
          type: "image/png",
          url: `/apple-touch-icon.png?v=${WAITSPIN_BRAND_ICON_VERSION}`,
        },
      ],
      shortcut: [`/icon-32.png?v=${WAITSPIN_BRAND_ICON_VERSION}`],
    });
    expect(waitspinBrandIcons.icon).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sizes: "180x180",
          type: "image/png",
          url: `/icon-180.png?v=${WAITSPIN_BRAND_ICON_VERSION}`,
        }),
        expect.objectContaining({
          sizes: "any",
          type: "image/svg+xml",
          url: `/icon.svg?v=${WAITSPIN_BRAND_ICON_VERSION}`,
        }),
        expect.objectContaining({
          sizes: "32x32",
          type: "image/png",
          url: `/icon-32.png?v=${WAITSPIN_BRAND_ICON_VERSION}`,
        }),
        expect.objectContaining({
          sizes: "48x48",
          type: "image/png",
          url: `/icon-48.png?v=${WAITSPIN_BRAND_ICON_VERSION}`,
        }),
        expect.objectContaining({
          sizes: "16x16 32x32 48x48",
          url: `/favicon.ico?v=${WAITSPIN_BRAND_ICON_VERSION}`,
        }),
      ]),
    );
    expect(favicon().headers.get("Content-Type")).toContain("image/x-icon");
    expect(icon180().headers.get("Content-Type")).toContain("image/png");
    expect(iconSvg().headers.get("Content-Type")).toContain("image/svg+xml");
    expect(icon32().headers.get("Content-Type")).toContain("image/png");
    expect(icon48().headers.get("Content-Type")).toContain("image/png");
    expect(appleTouchIcon().headers.get("Content-Type")).toContain("image/png");
    const originTrialResponse = webMcpOriginTrial();
    expect(originTrialResponse.headers.get("Content-Type")).toContain(
      "application/javascript",
    );
    expect(originTrialResponse.headers.get("Origin-Trial")).toContain(
      WAITSPIN_WEBMCP_ORIGIN_TRIAL_TOKENS[0],
    );

    const [
      brandIconsSource,
      launchPage,
      rootLayout,
      launchClient,
      landingRoadmap,
      publicChrome,
      legalContent,
    ] = await Promise.all([
      readFile(path.join(repoRoot, "app/waitspin/brand-icons.ts"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/page.tsx"), "utf8"),
      readFile(path.join(repoRoot, "app/layout.tsx"), "utf8"),
      readFile(
        path.join(repoRoot, "app/waitspin/waitspin-landing-client.tsx"),
        "utf8",
      ),
      readFile(
        path.join(repoRoot, "lib/waitspin/landing-roadmap.ts"),
        "utf8",
      ),
      readFile(path.join(repoRoot, "app/waitspin/public-chrome.tsx"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/legal-content.tsx"), "utf8"),
    ]);

    expect(brandIconsSource).toContain("docs/waitspin/brand/assets");
    expect(brandIconsSource).toContain("favicon-black.ico");
    expect(brandIconsSource).toContain("favicon-black-180.png");
    expect(brandIconsSource).toContain("favicon-black-32.png");
    expect(brandIconsSource).toContain("favicon-black-48.png");
    expect(brandIconsSource).toContain("orbit-symbol-black.svg");
    expect(brandIconsSource).not.toContain("app/waitspin/brand-assets");
    expect(launchPage).toContain("openGraph");
    expect(launchPage).toContain("twitter");
    expect(launchPage).toContain("/og/waitspin-home.png?v=20260625-linkedin");
    expect(launchPage).toContain('type: "image/png"');
    expect(launchPage).toContain("summary_large_image");
    expect(rootLayout).toContain("waitspinBrandIcons");
    expect(rootLayout).toContain("icons: waitspinBrandIcons");
    expect(launchPage).toContain('type="application/ld+json"');
    expect(launchPage).toContain("SoftwareApplication");
    expect(launchPage).toContain("Organization");
    expect(launchPage).toContain("WebSite");
    expect(launchPage).toContain("BreadcrumbList");
    expect(launchClient).toContain("What is WaitSpin?");
    expect(launchClient).toContain("WaitSpin is an agent-first ad marketplace");
    expect(launchClient).toContain("How does advertiser billing work?");
    expect(launchClient).toContain("How do users earn?");
    expect(launchClient).toContain("How do I install WaitSpin for VS Code?");
    expect(launchClient).toContain("How do I install WaitSpin for Cursor?");
    expect(launchClient).toContain("How do I install WaitSpin for Devin?");
    expect(launchClient).toContain("Which VS Code install is covered?");
    expect(launchClient).toContain(
      "WaitSpin is installed into Visual Studio Code itself",
    );
    expect(launchClient).toContain("VS Code-compatible Cursor Editor Mode");
    expect(launchClient).toContain("cursor.svg");
    expect(launchClient).toContain("devin.svg");
    expect(launchClient).toContain("Same VS Code Marketplace extension");
    expect(launchClient).toContain("Cursor Marketplace install");
    expect(launchClient).toContain(
      "Install the same VS Code-compatible extension into Cursor",
    );
    expect(launchClient).toContain(
      "cursor --install-extension waitspin.waitspin-vscode",
    );
    expect(launchClient).toContain("separate Cursor package or backend target");
    expect(launchClient).not.toContain("separate Cursor install path");
    expect(launchClient).toContain(
      "code --install-extension waitspin.waitspin-vscode",
    );
    expect(launchClient).toContain(
      "https://open-vsx.org/extension/waitspin/waitspin-vscode",
    );
    expect(launchClient).toContain("Open VSX install for Devin Desktop");
    expect(launchClient).toContain(
      "Install the Open VSX-published WaitSpin extension in Devin Desktop",
    );
    expect(launchClient).toContain(
      "devin-desktop --install-extension waitspin.waitspin-vscode",
    );
    expect(launchClient).toContain("selectedMarketplaceVersionLabel");
    expect(launchClient).toContain("openVsxVersionLabel");
    expect(launchClient).toContain("separate Devin package or backend target");
    const marketplaceCardBlock = launchClient.slice(
      launchClient.indexOf('className="waitspin-marketplace-card"'),
      launchClient.indexOf('className="waitspin-cli-actions"'),
    );
    expect(marketplaceCardBlock).toContain(
      "selectedPublisherTarget.marketplaceInstallTitle",
    );
    expect(marketplaceCardBlock).toContain(
      "selectedPublisherTarget.marketplaceInstallNote",
    );
    expect(marketplaceCardBlock).toContain("selectedMarketplaceVersionLabel");
    expect(marketplaceCardBlock).not.toContain(
      "vscodeMarketplaceVersionLabel",
    );
    const installAllCoverageBlock = launchClient.slice(
      launchClient.indexOf("const installAllCoveredTargets"),
      launchClient.indexOf("const publisherFullSetupCommands"),
    );
    expect(installAllCoverageBlock).toContain('"vscode"');
    expect(installAllCoverageBlock).not.toContain('"cursor"');
    expect(installAllCoverageBlock).not.toContain('"devin"');
    const cursorTargetBlock = launchClient.slice(
      launchClient.indexOf("  cursor: {"),
      launchClient.indexOf("  devin: {"),
    );
    expect(cursorTargetBlock).toContain('target: "status-bar-fallback"');
    expect(cursorTargetBlock).toContain(
      "installCommand: cursorMarketplaceInstallCommand",
    );
    expect(cursorTargetBlock).not.toContain(
      "installCommand: vscodeMarketplaceInstallCommand",
    );
    expect(cursorTargetBlock).not.toContain("vscodeCliFallbackInstallCommand");
    const devinTargetBlock = launchClient.slice(
      launchClient.indexOf("  devin: {"),
      launchClient.indexOf('  "claude-code": {'),
    );
    expect(devinTargetBlock).toContain('target: "status-bar-fallback"');
    expect(devinTargetBlock).toContain(
      "installCommand: devinDesktopInstallCommand",
    );
    expect(devinTargetBlock).toContain("marketplaceUrl: openVsxMarketplaceUrl");
    expect(devinTargetBlock).not.toContain(
      "installCommand: vscodeMarketplaceInstallCommand",
    );
    expect(devinTargetBlock).not.toContain("vscodeCliFallbackInstallCommand");
    expect(launchClient).toContain("Roo Code");
    expect(launchClient).toContain("Windsurf");
    expect(launchClient).toContain("Gemini Code Assist");
    expect(launchClient).toContain(
      "It does not read their prompts, responses, files, or extension data.",
    );
    expect(launchClient).not.toContain("VSCodium");
    expect(launchClient).not.toContain("Code OSS");
    expect(launchClient).toContain(
      "How do I install WaitSpin for Claude Code?",
    );
    expect(launchClient).toContain("How do I install WaitSpin for MiMo Code?");
    expect(launchClient).toContain("How do I install WaitSpin for OpenCode?");
    expect(launchClient).toContain(
      "How do I install every detected supported target?",
    );
    expect(launchClient).toContain("Is this native spinner patching?");
    expect(launchClient).toContain("What is supported now?");
    expect(launchClient).toContain("Supported now / roadmap");
    expect(launchClient).toContain("WaitSpinRoadmap");
    expect(launchClient).not.toContain("Coming soon");
    expect(landingRoadmap).toContain(
      "Native spinner patching beyond supported surfaces",
    );
    expect(landingRoadmap).toContain("Deep-link click billing");
    expect(landingRoadmap).toContain(
      "Self-serve cash refunds/account credit",
    );
    expect(landingRoadmap).toContain("Geo targeting");
    expect(landingRoadmap).not.toContain("Public skill registry publication");
    expect(launchClient).toContain(
      "waitspin install --all --dry-run --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing",
    );
    expect(launchClient).toContain(
      "waitspin install --all --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing",
    );
    expect(launchClient).toContain("waitspin status --all");
    expect(launchClient).toContain(
      "waitspin claude-code install --api-key PASTE_PUBLISHER_EXTENSION_KEY --compose-existing",
    );
    expect(launchClient).toContain(
      "waitspin mimocode install --api-key PASTE_PUBLISHER_EXTENSION_KEY",
    );
    expect(launchClient).toContain(
      "waitspin opencode install --api-key PASTE_PUBLISHER_EXTENSION_KEY",
    );
    expect(launchClient).toContain("MiMo Code shell hook");
    expect(launchClient).toContain("OpenCode TUI plugin slot");
    expect(launchClient).toContain("npx skills add citedy/waitspin");
    expect(launchClient).toContain("Copy Skill");
    expect(launchClient).toContain("Install the WaitSpin skill");
    expect(launchClient).toContain("Copy agent command");
    expect(launchClient).toContain("Copy install-all");
    expect(launchClient).not.toContain("How can agents install the skill?");
    expect(launchPage).toContain(
      "verified earning surfaces for VS Code, Cursor, Devin, Claude Code, Antigravity CLI, GitHub Copilot CLI, MiMo Code, OpenCode, Grok Code CLI, or Qoder CLI",
    );
    expect(launchPage).toContain(
      "Web, CLI, VS Code, Cursor, Devin, Claude Code, Antigravity CLI, GitHub Copilot CLI, MiMo Code, OpenCode, Grok Code CLI, Qoder CLI",
    );
    expect(launchPage).not.toContain(
      "publishers run the verified VS Code Activity Bar/status-bar extension",
    );
    expect(publicChrome).toContain('href="https://www.citedy.com"');
    expect(publicChrome).toContain(
      'href="https://www.linkedin.com/company/citedy/"',
    );
    expect(publicChrome).toContain('href="https://www.x.com/citedycom"');
    expect(publicChrome).toContain('aria-label="Citedy on LinkedIn"');
    expect(publicChrome).toContain('aria-label="Citedy on X"');
    expect(publicChrome).toContain("<LinkedInIcon />");
    expect(publicChrome).toContain("<XIcon />");
    expect(publicChrome).not.toContain(">in</a>");
    expect(publicChrome).not.toContain(">X</a>");
    expect(publicChrome).not.toContain("waitspin-citedy-mark");
    expect(publicChrome).toContain('href="/waitspin/terms"');
    expect(publicChrome).toContain('href="/waitspin/privacy"');
    expect(publicChrome).toContain('href="/waitspin/trust"');
    expect(publicChrome).toContain('href="/waitspin/agents.md"');
    expect(publicChrome).toContain(
      'const openApiPath = "/openapi/waitspin-api.openapi.json"',
    );
    expect(publicChrome).not.toContain("Your <");
    expect(publicChrome).not.toContain("api.waitspin.com/v1");
    expect(publicChrome).toContain("&copy; 2026");
    expect(publicChrome).toContain(
      "Not affiliated with Anthropic, OpenAI, or Microsoft or other (yet).",
    );
    expect(publicChrome).not.toContain(
      "Not affiliated with Anthropic, OpenAI, or Microsoft or other IDEs.",
    );
    expect(publicChrome).not.toContain(
      "Independent; not affiliated with Anthropic, OpenAI, or Microsoft.",
    );
    expect(legalContent).toContain("waitspin-page waitspin-text-page");
    expect(legalContent).toContain("WaitSpinFooter");
  });

  it("keeps public commission copy human-readable while internal docs retain the code source of truth", async () => {
    const [
      agentsMarkdown,
      llmsRoute,
      launchClient,
      publicApi,
      docsPage,
      termsPage,
    ] = await Promise.all([
      Promise.resolve(renderWaitSpinAgentsMarkdown()),
      readFile(path.join(repoRoot, "app/llms.txt/route.ts"), "utf8"),
      readFile(
        path.join(repoRoot, "app/waitspin/waitspin-landing-client.tsx"),
        "utf8",
      ),
      readFile(path.join(repoRoot, "docs/waitspin/PUBLIC_API.md"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/docs/page.tsx"), "utf8"),
      readFile(path.join(repoRoot, "app/waitspin/terms/page.tsx"), "utf8"),
    ]);
    const publicSources = [
      agentsMarkdown,
      llmsRoute,
      launchClient,
      publicApi,
      docsPage,
      termsPage,
    ];
    const commissionSentence = renderPublicCommissionSplitSentence();
    const normalizeDocWhitespace = (value: string) =>
      value.replace(/\s+/g, " ");
    const internalSources = await Promise.all([
      readFile(path.join(repoRoot, "docs/waitspin/LAUNCH_BLOCKERS.md"), "utf8"),
      readFile(
        path.join(repoRoot, "docs/waitspin/LEGAL_AND_POLICY.md"),
        "utf8",
      ),
      readFile(path.join(repoRoot, "docs/waitspin/ARCHITECTURE.md"), "utf8"),
    ]);

    const publicCommissionCopy = [
      formatPublisherRevenueSharePercentWords(),
      formatPlatformRevenueSharePercentWords(),
    ].join(" ");

    expect(agentsMarkdown).toContain(commissionSentence);
    expect(normalizeDocWhitespace(publicApi)).toContain(commissionSentence);
    expect(termsPage).toContain("formatPublisherRevenueSharePercentWords");
    expect(termsPage).toContain("formatPlatformRevenueSharePercentWords");
    expect(llmsRoute).toContain(
      "https://github.com/citedy/waitspin/blob/main/skills/waitspin/SKILL.md",
    );
    expect(llmsRoute).toContain(
      "npx skills add citedy/waitspin",
    );
    expect(llmsRoute).not.toContain("PASTE_PUBLISHER_EXTENSION_KEY");
    expect(llmsRoute).not.toContain(
      "Skills.sh and ClawHub publication remain planned follow-up",
    );

    for (const source of publicSources) {
      expect(source).not.toContain("WTS_PUBLISHER_REVENUE_BPS");
      expect(source).not.toContain(WTS_STRIPE_FEE_POLICY);
      expect(source).not.toMatch(/50 percent user|50 percent share/i);
      expect(source).not.toMatch(
        /Source of truth:\s*WTS_PUBLISHER_REVENUE_BPS/i,
      );
      expect(source).not.toMatch(
        /Stripe fee policy is\s*platform_absorbs_stripe_fees/i,
      );
    }
    expect(publicCommissionCopy).toContain("60");
    expect(publicCommissionCopy).toContain("40");
    const publicCombined = publicSources.join("\n");
    expect(publicCombined).toContain("60");
    expect(publicCombined).toContain("40");
    expect(publicCombined).toMatch(/Stripe processing fees/i);
    expect(publicCombined).toMatch(/platform share/i);

    const internalCombined = internalSources.join("\n");
    expect(internalCombined).toContain(String(WTS_PUBLISHER_REVENUE_BPS));
    expect(internalCombined).toContain(WTS_STRIPE_FEE_POLICY);

    for (const source of internalSources) {
      expect(source).toMatch(/platform share|platform commission/i);
      expect(source).toMatch(/Stripe\s+fees|Stripe fee policy/i);
    }
  });
});
