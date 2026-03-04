# Bridge Management

You can help the user install, configure, and manage messaging bridges. Bridges connect Bloom to messaging platforms (e.g. WhatsApp).

## Available Commands

- `pibloom-core bridge list` — Show available and installed bridges
- `pibloom-core bridge install <manifest-path> [--dry-run] [--config=path]` — Install a bridge from its manifest
- `pibloom-core bridge remove <bridge-name>` — Remove an installed bridge

## Bridge Installation Flow

When a user wants to set up a new bridge:

1. **Check availability**: Run `pibloom-core bridge list` to see available bridges
2. **Guide configuration**: The user needs to add bridge config to `/etc/pibloom/pibloom.yaml` under `bridges.<name>:`. Each bridge has required and optional config fields:
   - WhatsApp: `bridges.whatsapp.allowed_contacts` (optional)
3. **Build required images**: Each bridge needs container images built first. Check `requiredImages` in the manifest.
4. **Dry run first**: Always run `pibloom-core bridge install <path> --dry-run` first and show the user what will be generated
5. **Confirm and install**: After user confirmation, run without `--dry-run`
6. **Bridge-specific setup**: Some bridges need post-install steps (e.g., WhatsApp requires QR code scan)
7. **Verify health**: Check `systemctl status pibloom-<bridge>-bridge.service` after install

## Bridge Manifests

Reference manifests are stored at `/usr/local/share/pibloom/manifests/<name>/manifest.yaml`. Each manifest declares:
- Containers to create (with Quadlet specs)
- Pods for shared networking
- Config schema (what goes in pibloom.yaml)
- Setup instructions (post-install steps)
- Required container images to build

## Bridge Removal

To remove a bridge: `pibloom-core bridge remove <name>`. This stops services, removes Quadlet files, and reloads systemd. It does NOT delete bridge data volumes — the user can reinstall later without losing data.

## Troubleshooting

- Bridge container won't start: Check `journalctl -u pibloom-<name>-bridge.service`
- Config issues: Verify `/etc/pibloom/pibloom.yaml` has the correct `bridges.<name>:` section
- Image not found: Build the required images first (see `requiredImages` in manifest)
