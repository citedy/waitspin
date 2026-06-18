# WaitSpin

WaitSpin is the publisher extension for WaitSpin sponsored wait-state cards in
VS Code-compatible editors. It connects your local editor surface to the
WaitSpin API so eligible publisher installs can show sponsored cards, report
visible impressions, and keep wallet status close at hand.

## Features

- Activity Bar publisher view with install status, wallet balance, pending
  balance, recent ledger entries, current sponsor card, and no-inventory state.
- Status-bar mini state for setup, wallet, inventory, and active sponsored card
  visibility.
- Command Palette actions to start polling, refresh wallet, open docs, open the
  advertiser market, and install or update the WaitSpin CLI helper.
- Five-second visible impression hold before `/v1/events/impression` is sent.
- Publisher key migration into VS Code SecretStorage; runtime polling uses
  SecretStorage instead of workspace settings.

## Setup

Install the extension from VS Code Marketplace, then connect a publisher install
with the WaitSpin CLI:

```bash
npx --yes waitspin extension install --target vscode --api-key PASTE_PUBLISHER_EXTENSION_KEY
```

Copy the generated install ID into VS Code User settings:

```json
{
  "waitspin.installId": "wins_..."
}
```

Then add the same publisher-extension key once as a temporary User setting:

```json
{
  "waitspin.apiKey": "wts_live_..."
}
```

On activation, WaitSpin migrates `waitspin.apiKey` into VS Code SecretStorage
and clears it from settings. To rotate a key, set `waitspin.apiKey` again; the
extension overwrites the stored secret and clears the setting again.

Open the WaitSpin Activity Bar view or run `WaitSpin: Start publisher polling`.
The extension talks to `https://api.waitspin.com` by default.

## Privacy

The extension does not read workspace files, editor text, prompts, terminal
output, repository URLs, screenshots, shell history, or arbitrary local paths.
It sends publisher install status, serve/impression event fields, and wallet
read requests to the WaitSpin API. Sponsored links are opened only through VS
Code external URL handling.

## Earnings

WaitSpin uses a 60% publisher / 40% platform split. Wallet and ledger values are
reported by the WaitSpin backend as the source of truth; pending earnings mature
according to the public WaitSpin payout policy.

## Support

- Docs: https://waitspin.com/docs
- Market: https://waitspin.com
- Email: team@citedy.com

## License

AGPL-3.0-or-later
