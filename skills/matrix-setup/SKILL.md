---
name: matrix-setup
description: Interactive Matrix channel setup — configures homeserver URL, sets access token, and verifies bridge connectivity.
---

# Matrix Channel Setup (Guided)

Use this skill when the user wants to set up the Matrix messaging channel on their Nazar instance. The bridge connects to any Matrix homeserver (e.g. matrix.org) — no self-hosted server required.

## Goals

1. Configure the Matrix homeserver URL.
2. Set the bot access token.
3. Verify the bridge service connects and responds.

## Prerequisites

- Nazar is installed and `nazar apply` works.
- The user has a Matrix account for the bot (create one at https://app.element.io or any Matrix client).
- The user has the bot account's access token.
- The user has shell access (SSH, ttyd, or local terminal).

## Guided Flow

### Phase 1: Review Current Configuration

1. Read the current Matrix channel config:
   ```bash
   cat /etc/nazar/nazar.yaml
   ```
2. Show the user the current Matrix module settings:
   - `homeserver_url` (default: `https://matrix.org`)
   - `allowed_users` (list of Matrix user IDs allowed to message the bot)
3. Ask the user:
   - "What Matrix homeserver should the bot connect to? (default: https://matrix.org)"
   - "What is the bot's access token?"
   - "Which Matrix users should be allowed to message the bot? (e.g. @alice:matrix.org)"

### Phase 2: Configure and Apply

4. Update `homeserver_url` and `allowed_users` in `/etc/nazar/nazar.yaml`.
5. Set the access token via environment variable or secrets file:
   ```bash
   echo "NAZAR_MATRIX_ACCESS_TOKEN=<token>" | sudo tee /run/secrets/nazar-matrix-token
   ```
6. Apply the configuration:
   ```bash
   sudo nazar apply
   ```

### Phase 3: Verify Bridge

7. Check the bridge service status:
   ```bash
   systemctl status nazar-matrix-bridge --no-pager
   ```
8. Check bridge logs for successful connection:
   ```bash
   journalctl -u nazar-matrix-bridge --no-pager -n 20
   ```
   Look for: "Connected to Matrix homeserver." and "Bot user ID: @nazar:..."
9. If the bridge fails:
   - Check the access token is set:
     ```bash
     sudo test -f /run/secrets/nazar-matrix-token && echo "exists" || echo "missing"
     ```
   - Restart and watch logs:
     ```bash
     sudo systemctl restart nazar-matrix-bridge
     journalctl -u nazar-matrix-bridge -f
     ```

### Phase 4: Connect Client and Test

10. Guide the user to message the bot:
    - "Open your Matrix client (Element, etc.)."
    - "Start a new Direct Message with the bot account."
    - "The bot auto-joins rooms, so it should appear within a few seconds."
11. Ask the user to send a test message:
    - "Send a simple message like 'hello' and wait for a response."
12. If no response:
    - Check bridge logs: `journalctl -u nazar-matrix-bridge -f`
    - Confirm the sending user is in `allowed_users`
    - Confirm Pi is accessible: `pi -p "hello"` from the nazar user

### Phase 5: Summary

13. Print a summary of the completed setup:
    ```
    Matrix Channel Setup Complete
    =============================
    Homeserver:    <homeserver_url>
    Bot account:   <bot user ID from logs>
    Bridge status: active
    ```

## Configuration Reference

Matrix options live under `matrix` in `/etc/nazar/nazar.yaml`:

| Option           | Default              | Description                      |
| ---------------- | -------------------- | -------------------------------- |
| `homeserver_url` | `https://matrix.org` | Matrix homeserver client-server URL |
| `allowed_users`  | `[]`                 | Users allowed to message the bot |

Environment variables for the bridge container:

| Variable                       | Description                |
| ------------------------------ | -------------------------- |
| `NAZAR_MATRIX_HOMESERVER`      | Homeserver URL (required)  |
| `NAZAR_MATRIX_ACCESS_TOKEN`    | Bot access token (required)|
| `NAZAR_MATRIX_ALLOWED_USERS`   | Comma-separated user IDs   |

## Troubleshooting

### Bridge keeps restarting

```bash
journalctl -u nazar-matrix-bridge --no-pager -n 50
# Common: invalid access token, homeserver unreachable
# Fix: verify token, check homeserver URL, restart bridge
```

### Bot doesn't respond to messages

- Confirm the sending user is in `allowed_users` (check with `grep NAZAR_MATRIX_ALLOWED_USERS`)
- Confirm the bot has joined the room (check bridge logs for "room.message" events)
- Confirm Pi is accessible: `pi -p "hello"` from the nazar user

### Access token expired or lost

Generate a new access token from your Matrix client or via the homeserver's API, then update the secrets file and restart the bridge.

## Safety Notes

- Never commit access tokens or passwords to git.
- The `NAZAR_MATRIX_ACCESS_TOKEN` is loaded via environment variable to keep secrets out of config files.
- Use `allowed_users` to restrict who can message the bot.
