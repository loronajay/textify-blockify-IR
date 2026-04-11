# Leaderboard Server Status

Canonical reference for the JayArcade leaderboard backend. Update this file whenever server state, game config, or pipeline status changes.

---

## Server

| | |
|---|---|
| **Platform** | Railway (separate project from Factory Network) |
| **Default URL** | `https://leaderboard-server-production.up.railway.app` |
| **Custom domain** | None yet |
| **Status** | Live and deployed |

---

## `window.JayLeaderboard` Interface

The extension never talks to the server directly. The build pipeline injects a `window.JayLeaderboard` helper into each game's HTML. The extension calls that helper.

```js
JayLeaderboard.submit(playerName, score)
// Promise — resolves on success, rejects on network/server error

JayLeaderboard.getTop(limit = 10, device = null)
// Promise → [{ rank, playerName, score, createdAt }, ...]

JayLeaderboard.deviceType()
// "mobile" | "desktop" (synchronous)
```

`window.JayLeaderboard` is `undefined` in any game not yet configured. All cloud sync blocks handle this with silent no-ops.

---

## Extension Status

All leaderboard blocks are implemented in `factory-leaderboards.js`.

**Cloud sync (4 blocks):** ✓ Done

| Block | Opcode | Status |
|---|---|---|
| `cloud leaderboard available ?` | `cloudAvailable` | Done |
| `submit to cloud player [P] score [V]` | `submitToCloud` | Done |
| `fetch top [N] scores from cloud into leaderboard [NAME]` | `fetchFromCloud` | Done |
| `cloud sync status` | `cloudSyncStatus` | Done |

**Name entry (6 blocks):** arcade-style letter picker, A–Z + 0–9 + space, 1–7 characters. See `NAME_ENTRY.md` for the full block reference and wiring guide.

**Note:** Any game using these cloud sync blocks must be rebuilt and re-exported from TurboWarp for changes to take effect.

---

## Pipeline Integration Status

**End-to-end live as of 2026-04-11. Apple-catcher fully wired and tested.**

Completed:
- `.env` created with all 9 game keys; keys deployed as Railway env vars
- `game.json` leaderboard block added to all games (enabled for apple-catcher, bird-duty, blade-and-sphere, space-molestors, speed-demon)
- `patch_all_games.py` extended to inject `leaderboard` config into `JAY_GAME_CONFIG` + `JayLeaderboard` helper inline
- apple-catcher rebuilt in TurboWarp with leaderboard blocks wired up, deployed, end-to-end tested

Remaining:
- Wire up leaderboard blocks in: bird-duty, blade-and-sphere, space-molestors, speed-demon
- Rebuild + re-export each, then full build + deploy

Full status tracked in `games-directory-page/leaderboard-server-progress.md`.

---

## Per-Game Enablement

| Game | `leaderboard.enabled` | Notes |
|---|---|---|
| `apple-catcher` | true | Live — end-to-end tested 2026-04-11 |
| `art-of-war` | false | Not planned yet |
| `bird-duty` | true | Pipeline patched; needs TurboWarp rebuild |
| `blade-and-sphere` | true | Pipeline patched; needs TurboWarp rebuild |
| `dodgeballs` | false | Not planned yet |
| `paddle-battle` | false | Not planned yet |
| `space-molestors` | true | Pipeline patched; needs TurboWarp rebuild |
| `speed-demon` | true | Pipeline patched; needs TurboWarp rebuild |
| `sumorai` | false | Not planned yet |
