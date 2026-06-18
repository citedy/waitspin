# WaitSpin MiMo Code Integration

WaitSpin publisher support for MiMo Code CLI — sponsored status-line messages
in your terminal.

## Quick Start

```bash
# 1. Get a publisher-extension key
npx waitspin init --email you@example.com --key-profile publisher-extension

# 2. Install for MiMo Code
waitspin mimocode install --api-key wts_live_...

# 3. Check status
waitspin mimocode status

# 4. Restart your shell or run:
source ~/.bashrc
```

## How It Works

1. **Install** registers your install ID with WaitSpin and adds a bash hook
2. **Runtime** polls `POST /v1/serve/next` every 15 seconds for sponsored messages
3. **Display** shows the ad line in your terminal: `── Sponsored message ──`
4. **Impression** records a billable view after 5 seconds of visibility

## Commands

### `waitspin mimocode install`

Register publisher and configure shell integration.

```bash
waitspin mimocode install --api-key wts_live_...
waitspin mimocode install --dry-run  # preview without changes
```

Options:
- `--api-key KEY` — publisher-extension API key (or set `WAITSPIN_API_KEY`)
- `--dry-run` — show what would be done without making changes

### `waitspin mimocode status`

Show installation state and health.

```bash
waitspin mimocode status
```

Output includes:
- `install_id` — unique install identifier
- `publisher_id` — registered publisher ID
- `publisher_registered` — whether registration succeeded
- `runtime_exists` — whether runtime script is present
- `bashrc_hook` — whether shell hook is installed

### `waitspin mimocode uninstall`

Remove all managed files and hooks.

```bash
waitspin mimocode uninstall
waitspin mimocode uninstall --dry-run  # preview without changes
```

Removes:
- `~/.waitspin/mimocode-statusline.json`
- `~/.waitspin/mimocode-statusline-cache.json`
- Bash hook from `~/.bashrc`

## Runtime Script

The runtime script (`waitspin-mimocode-runtime`) can be called directly:

```bash
# Fetch and display one ad line
waitspin-mimocode-runtime

# Use in a custom prompt
PS1="$(__waitspin_statusline)\n$ "
```

The generated runtime strips terminal control characters from sponsor text
before the bash hook renders it.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WAITSPIN_API_KEY` | — | Publisher-extension API key |
| `WAITSPIN_BASE_URL` | `https://api.waitspin.com` | API base URL |
| `WAITSPIN_DEV` | — | Must be `1` before dev override executables are honored |
| `WAITSPIN_CLI_JS` | — | Development-only CLI delegator override |
| `WAITSPIN_MIMOCODE_RUNTIME` | — | Development-only runtime launcher override |

### State Files

| File | Purpose |
|------|---------|
| `~/.waitspin/mimocode-statusline.json` | Install state (API key, install ID) |
| `~/.waitspin/mimocode-statusline-cache.json` | Runtime cache (active serve) |

## Trust and Warmup

New publishers start at trust level 1/10. The serve endpoint returns empty
inventory until trust warms up. Expected warmup: ~10 days.

During warmup, `waitspin-mimocode-runtime` exits silently (no output, no errors).

## Security

- API key stored with `chmod 600` (owner read/write only)
- Runtime never logs or echoes credentials
- No credentials written to MiMo Code config files
- State file is isolated in `~/.waitspin/`
- `WAITSPIN_CLI_JS` and `WAITSPIN_MIMOCODE_RUNTIME` are ignored unless
  `WAITSPIN_DEV=1`. They are development-only trust-boundary overrides; do not
  set them in shared shells, CI, or production-like environments unless you
  intentionally trust the executable.

## Differences from VS Code Extension

| Aspect | VS Code | MiMo Code |
|--------|---------|-----------|
| Display | Status bar item | Terminal output |
| Runtime | Packaged extension | Node.js runtime invoked by bash hook |
| Auth storage | VS Code SecretStorage | `~/.waitspin/` state file |
| Polling | Extension host interval | Prompt hook/runtime interval |
| Impression | After min_visible_ms | After min_visible_ms |

## Architecture

See [MIMOCODE_ARCHITECTURE.md](./MIMOCODE_ARCHITECTURE.md) for detailed
architecture documentation.

## Files

```
packages/waitspin/assets/waitspin-mimocode/
├── README.md                    # This file
├── mimocode-install.sh          # CLI delegator for install
├── mimocode-status.sh           # CLI delegator for status
├── mimocode-uninstall.sh        # CLI delegator for uninstall
└── mimocode-runtime.sh          # Launcher for generated runtime

docs/waitspin/
├── MIMOCODE_ARCHITECTURE.md     # Architecture document
```

## Development

```bash
# Test with local API
WAITSPIN_BASE_URL=http://localhost:8787 waitspin mimocode install --dry-run

# Run runtime manually
WAITSPIN_API_KEY=wts_live_... waitspin-mimocode-runtime

# Check state
cat ~/.waitspin/mimocode-statusline.json | python3 -m json.tool
```

## License

MIT — same as the waitspin package.
