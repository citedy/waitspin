# WaitSpin: Sponsored Wait States

WaitSpin lets developers earn from their VS Code wait states. It shows short
sponsored cards, records payable impressions only after 5 seconds visible, and
keeps wallet and ledger status in the editor without reading workspace files,
prompts, terminal output, repository URLs, screenshots, or shell history.

## Features

- Activity Bar view with install status, wallet balance, pending
  balance, recent ledger entries, current sponsor card, and no-inventory state.
- Status-bar mini state for setup, wallet, inventory, and active sponsored card
  visibility.
- Command Palette actions to connect WaitSpin, start polling,
  refresh wallet, open docs, open the advertiser market, and install or update
  the WaitSpin CLI helper.
- Five-second visible impression hold before `/v1/events/impression` is sent.
- Connection setup inside VS Code. API keys are stored in VS Code SecretStorage;
  install state is global to the VS Code user and not workspace-scoped.

## Setup

Install the extension from VS Code Marketplace:

https://marketplace.visualstudio.com/items?itemName=waitspin.waitspin-vscode

```bash
code --install-extension waitspin.waitspin-vscode
```

Then run:

```text
WaitSpin: Connect and earn
```

The extension can request an extension API key by email verification or accept
an existing extension API key. It registers the VS Code install, stores the key
in VS Code SecretStorage, stores the install ID in global extension state, and
starts wallet/sponsor polling.

### CLI fallback

The WaitSpin CLI remains available for advanced setup and diagnostics:

```bash
npx --yes waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY
```

If you use the CLI fallback, copy the generated install ID into VS Code User
settings:

```json
{
  "waitspin.installId": "wins_..."
}
```

Then add the same extension API key once as a temporary User setting:

```json
{
  "waitspin.apiKey": "wts_live_..."
}
```

On activation, WaitSpin migrates `waitspin.apiKey` into VS Code SecretStorage
and clears it from settings. To rotate a key, set `waitspin.apiKey` again; the
extension overwrites the stored secret and clears the setting again. For the
normal Marketplace path, use `WaitSpin: Connect and earn` instead.

Open the WaitSpin Activity Bar view or run `WaitSpin: Start sponsor polling`.
The extension talks to `https://api.waitspin.com` by default.

## Privacy

The extension does not read workspace files, editor text, prompts, terminal
output, repository URLs, screenshots, shell history, or arbitrary local paths.
It sends WaitSpin install status, serve/impression event fields, and wallet
read requests to the WaitSpin API. Sponsored links are opened only through VS
Code external URL handling.

## Earnings

WaitSpin uses a 60% user / 40% platform split. Wallet and ledger values are
reported by the WaitSpin backend as the source of truth; pending earnings mature
according to the public WaitSpin payout policy.

## Support

- Docs: https://waitspin.com/docs
- Market: https://waitspin.com
- Email: team@citedy.com

## License

AGPL-3.0-or-later
