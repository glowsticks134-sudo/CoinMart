# CoinMart Discord Bot

A professional Discord bot for the CoinMart server with a secure code generation and redemption system, supporting role rewards, currency prizes, manual approvals, and full audit logging.

## Run & Operate

- `pnpm --filter @workspace/coinmart-bot run dev` — start the bot (also what the workflow runs)
- Required env secrets: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`

## Stack

- pnpm workspaces, Node.js 24, JavaScript (ESM)
- Discord.js v14 with slash commands
- sql.js (pure-JS SQLite, no native compilation needed)
- Persistent database saved to `artifacts/coinmart-bot/data/coinmart.db`

## Where things live

- `artifacts/coinmart-bot/src/index.js` — bot entry point, loads commands + events
- `artifacts/coinmart-bot/src/commands/` — all slash commands
- `artifacts/coinmart-bot/src/events/` — ready + interactionCreate handlers
- `artifacts/coinmart-bot/src/lib/` — database, permissions, cooldowns, expiry, logging
- `artifacts/coinmart-bot/data/coinmart.db` — SQLite database (auto-created)

## Slash Commands

| Command | Who can use | Description |
|---|---|---|
| `/generatecode` | Staff/Admin | Create a new redemption code with prize, uses, expiry |
| `/claim` | Everyone | Redeem a COINMART- code |
| `/codes` | Staff/Admin | List all active codes |
| `/codeinfo` | Staff/Admin | Detailed info + claim history for a specific code |
| `/deletecode` | Staff/Admin | Deactivate a code immediately |
| `/approve` | Staff/Admin | Approve or deny a pending manual claim |
| `/leaderboard` | Everyone | Top 10 claimers in the server |
| `/config` | Admins only | Set admin role + log channel |

## Prize Types

- `currency` — coins/currency reward (text description)
- `role` — automatically grants a Discord role on claim
- `custom` — any custom text reward
- `manual` — queued for staff approval via `/approve`

## Security Features

- Codes always start with `COINMART-` (format-validated on claim)
- Duplicate claim prevention per user per code
- Cooldowns: 10s on `/claim`, 5s on `/generatecode`
- Permission check: Admin, ManageGuild, server owner, or configured admin role
- Auto-expiry job runs every 60 seconds

## Architecture decisions

- sql.js chosen over better-sqlite3 because Replit's NixOS environment lacks the native build toolchain needed for gyp compilation
- Database persisted to disk every 10 seconds + on process exit to balance performance with durability
- Commands auto-deployed to Discord on bot ready event (global scope, ~1hr propagation on first deploy)
- Single workflow `CoinMart Bot` runs the bot as a console process (no HTTP server)

## Gotchas

- Global slash commands take up to 1 hour to propagate to all Discord servers after first deploy
- If you add a new command file, the bot auto-redeploys commands on next restart
- The `data/` directory is gitignored — database is ephemeral across Replit restarts unless you pin storage

## User preferences

- Bot name: CoinMart
- Code prefix: COINMART-
- Embed colors: Green (success), Red (errors), Gold (generated codes)
