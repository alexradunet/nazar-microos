---
name: install-nazar
description: Conversational first-time Nazar setup — detects hardware, gathers configuration, generates MicroOS config files, applies and verifies.
---

# Install Nazar (Guided)

Use this skill when the user is setting up Nazar on a fresh MicroOS machine or reconfiguring an existing install. You are a conversational setup assistant — no TUI or wizard, just guided conversation.

## First-Run Detection

Check whether setup has already been completed:

```bash
[ -f /etc/nazar/.setup-complete ] && echo "already configured" || echo "fresh install"
```

If already configured, ask the user whether they want to reconfigure or exit.

## Distribution Model

Nazar is consumed as a flake input via `nix flake init -t github:alexradunet/nazar`. Users do not clone the repo — they reference it. The setup skill generates a minimal config directory:

```
~/Nazar/
  flake.nix          # imports nazar as a flake input
  flake.lock         # pinned versions
  hardware.nix       # auto-detected hardware config
  nazar-config.nix   # module enable flags + identity
```

## Goals

1. Prevent disk UUID mismatch at boot.
2. Prevent password/login surprises by reusing the existing installer user.
3. Apply Nazar only after explicit user confirmation.
4. Configure optional modules via `nazar-config.nix` enable flags.

## Prerequisites

- MicroOS with flakes enabled (`nix.settings.experimental-features = [ "nix-command" "flakes" ];`)

## Guided Flow

### Phase 1: Detect Environment

Gather system facts automatically — do not ask the user for these:

```bash
hostname
whoami
[ -d /sys/firmware/efi ] && echo "UEFI" || echo "BIOS"
uname -m   # x86_64 or aarch64
pwd
```

Determine:

- **hostname** — current machine hostname
- **username** — current user (or `$SUDO_USER` if running as root)
- **boot mode** — UEFI or BIOS (drives bootloader config)
- **architecture** — map `x86_64` → `"x86_64-linux"`, `aarch64` → `"aarch64-linux"`
- **repo root** — current working directory (should contain `flake.nix` or be the target dir)

Tell the user what you detected:

> "I detected hostname **X**, user **Y**, boot mode **Z**, architecture **A**. I'll use these as defaults."

### Phase 2: Gather Configuration

Ask the user conversationally about each section. Use the detected values as defaults.

#### Identity

- **Hostname** — default: detected. "What hostname should this machine use?"
- **Username** — default: detected. "What Linux username should be the primary user?"
- **Timezone** — default: `UTC`. "What timezone? (e.g. Europe/London, America/New_York)"

#### Boot Loader

Auto-configure based on Phase 1 detection:

- **UEFI**: systemd-boot + `canTouchEfiVariables = true` + `grub.enable = false`
- **BIOS**: GRUB + ask for boot device (default `/dev/sda`)

Tell the user what you'll configure and confirm.

#### Modules

Present the available modules with recommended defaults:

| Module           | Default | Description                      |
| ---------------- | ------- | -------------------------------- |
| `tailscale`      | on      | VPN for secure remote access     |
| `syncthing`      | on      | File synchronization             |
| `ttyd`           | on      | Web terminal (Tailscale-only)    |
| `desktop`        | on      | GNOME desktop + VS Code          |
| `passwordPolicy` | on      | Password strength enforcement    |
| `objects`        | on      | Object store data directory      |
| `heartbeat`      | off     | Periodic agent observation cycle |
| `matrix`         | off     | Matrix messaging channel         |

Ask: "Which modules would you like to change from these defaults?"

### Phase 3: Generate Hardware Config

Run hardware detection:

```bash
# (MicroOS uses KIWI image, no generate-config) --show-hardware-config > hardware.nix
```

Check for an existing desktop environment:

```bash
systemctl is-active gdm sddm lightdm 2>/dev/null
```

If a display manager is active, note it — the user may want `nazar.desktop.enable = false` to preserve their existing desktop setup.

Show the user a summary of the hardware config and confirm.

### Phase 4: Generate Config Files

Using `templates/default/flake.nix` and `templates/default/nazar-config.nix` as reference, generate two files with the user's values substituted.

#### `flake.nix`

```nix
{
  description = "My Nazar server";

  inputs = {
    nazar.url = "github:alexradunet/nazar";
    nixpkgs.follows = "nazar/nixpkgs";
    nixpkgs-unstable.follows = "nazar/nixpkgs-unstable";
  };

  outputs = { self, nazar, nixpkgs, nixpkgs-unstable, ... }:
    let
      system = "<SYSTEM>";  # "x86_64-linux" or "aarch64-linux"
      pkgsUnstable = import nixpkgs-unstable {
        inherit system;
        config.allowUnfree = true;
      };
    in {
      # MicroOS config.<HOSTNAME> = # MicroOS system {
        inherit system;
        specialArgs = { inherit pkgsUnstable; };
        modules = [
          # nazar apply handles config
          ./hardware.nix
          ./nazar-config.nix
        ];
      };
    };
}
```

Replace `<HOSTNAME>` with the user's chosen hostname and `<SYSTEM>` with the detected architecture.

#### `nazar-config.nix`

```nix
{ config, lib, ... }:

{
  # --- Identity ---
  networking.hostName = "<HOSTNAME>";
  nazar.primaryUser = "<USERNAME>";
  nazar.timeZone = "<TIMEZONE>";

  # --- Path override ---
  # nazar.repoRoot = "<REPO_ROOT>";  # generate when pwd differs from /home/<USERNAME>/Nazar

  # --- Boot loader ---
  # (UEFI or BIOS block based on detection)

  # --- Modules ---
  nazar.tailscale.enable = <true/false>;
  nazar.syncthing.enable = <true/false>;
  nazar.ttyd.enable = <true/false>;
  nazar.desktop.enable = <true/false>;
  nazar.passwordPolicy.enable = <true/false>;
  nazar.objects.enable = <true/false>;
  # nazar.heartbeat.enable = <true/false>;
  # nazar.channels.matrix.enable = <true/false>;
}
```

If the current working directory is `/home/<USERNAME>/Nazar`, leave `nazar.repoRoot` commented out (it matches the default). Otherwise, uncomment it and set it to the actual `pwd`.

Show the user the generated files and ask for confirmation before writing.

### Phase 5: Write Files + Initialize

After user confirmation:

1. Write `flake.nix`, `hardware.nix`, and `nazar-config.nix` to the repo root.
2. Initialize git repo and stage files:
   ```bash
   git init && git add -A && git commit -m "Initial Nazar configuration"
   ```

### Phase 6: Apply

Run the MicroOS rebuild:

```bash
sudo nazar apply --flake .
```

If this is the very first flake rebuild (flakes not yet system-wide):

```bash
sudo env NIX_CONFIG="experimental-features = nix-command flakes" nazar apply --flake "path:$PWD#<HOSTNAME>"
```

If the rebuild fails:

- Show the error output.
- Offer to rollback: `sudo nazar apply --rollback`
- Help the user diagnose and fix the issue.

### Phase 7: Verify

1. Run the verification script:
   ```bash
   ./scripts/verify-nazar.sh
   ```
2. Write the setup-complete marker:
   ```bash
   sudo install -d -m 0755 /etc/nazar
   sudo touch /etc/nazar/.setup-complete
   ```
3. Print a summary:
   ```
   Nazar Setup Complete
   ====================
   Hostname:     <hostname>
   User:         <username>
   Timezone:     <timezone>
   Boot mode:    <UEFI/BIOS>
   Modules:      <enabled list>
   Config dir:   <path>
   ```
4. Remind the user:
   - "Run `nazar` to start your AI assistant."
   - "Run `nazar apply` to apply future config changes safely."
   - "Run `nazar --skill ./skills/matrix-setup/SKILL.md` to set up Matrix messaging."

## Module Configuration Reference

All module enable flags live in `nazar-config.nix`:

```nix
nazar.tailscale.enable = true;
nazar.syncthing.enable = true;
nazar.ttyd.enable = true;
nazar.desktop.enable = true;
nazar.passwordPolicy.enable = true;
nazar.objects.enable = true;
nazar.heartbeat.enable = false;
nazar.channels.matrix.enable = false;
```

## Troubleshooting

### GRUB assertion error

If you see "GRUB is enabled but no boot devices are configured":

- UEFI machines: set `boot.loader.grub.enable = false;` and `boot.loader.systemd-boot.enable = true;`
- BIOS machines: set `boot.loader.grub.devices = [ "/dev/sda" ];` (adjust to your disk)

### Rebuild fails with "path not found"

Ensure all config files are staged: `git add -A`

### Flakes not enabled

Add to your MicroOS configuration and rebuild:

```nix
nix.settings.experimental-features = [ "nix-command" "flakes" ];
```

## Safety Notes

- Do not run destructive disk commands.
- Do not edit boot/disk config without showing diff and asking the user first.
- Keep changes minimal and declarative.
- Always show generated config files to the user before writing.
- Offer rollback if the rebuild fails.
