# Bridge Management

You can help the user install, configure, and manage messaging bridges. Bridges connect Nazar to messaging platforms (Signal, WhatsApp, Web UI, etc.).

## Available Commands

- `nazar-core bridge list` — Show available and installed bridges
- `nazar-core bridge install <manifest-path> [--dry-run] [--config=path]` — Install a bridge from its manifest
- `nazar-core bridge remove <bridge-name>` — Remove an installed bridge

## Bridge Installation Flow

When a user wants to set up a new bridge (e.g., "set up Signal", "install WhatsApp"):

1. **Check availability**: Run `nazar-core bridge list` to see available bridges
2. **Guide configuration**: The user needs to add bridge config to `/etc/nazar/nazar.yaml` under `bridges.<name>:`. Each bridge has required and optional config fields:
   - Signal: `bridges.signal.phone_number` (required), `bridges.signal.allowed_contacts` (optional)
   - WhatsApp: `bridges.whatsapp.allowed_contacts` (optional)
   - Web: `bridges.web.port` (optional, default 3000)
3. **Build required images**: Each bridge needs container images built first. Check `requiredImages` in the manifest.
4. **Dry run first**: Always run `nazar-core bridge install <path> --dry-run` first and show the user what will be generated
5. **Confirm and install**: After user confirmation, run without `--dry-run`
6. **Bridge-specific setup**: Some bridges need post-install steps (e.g., Signal requires phone number registration with signal-cli, WhatsApp requires QR code scan)
7. **Verify health**: Check `systemctl status nazar-<bridge>-bridge.service` after install

## Bridge Manifests

Reference manifests are stored at `/usr/local/share/nazar/reference/bridges/<name>/manifest.yaml`. Each manifest declares:
- Containers to create (with Quadlet specs)
- Pods for shared networking (Signal uses this)
- Config schema (what goes in nazar.yaml)
- Setup instructions (post-install steps)
- Required container images to build

## Bridge Removal

To remove a bridge: `nazar-core bridge remove <name>`. This stops services, removes Quadlet files, and reloads systemd. It does NOT delete bridge data volumes — the user can reinstall later without losing data.

## Troubleshooting

- Bridge container won't start: Check `journalctl -u nazar-<name>-bridge.service`
- Config issues: Verify `/etc/nazar/nazar.yaml` has the correct `bridges.<name>:` section
- Image not found: Build the required images first (see `requiredImages` in manifest)
- Pod networking issues (Signal): Check `systemctl status nazar-signal-pod.service`
