# AGENTS.md

This file provides guidance to Codex when working in `factory_extensions/`.

This is the Codex equivalent of `factory_extensions/CLAUDE.md`. Keep the two aligned when these folder-specific instructions change.

## JayArcade Context

These production TurboWarp extensions power games on JayArcade.com. Prioritize correctness, stability, and beginner-accessible block design.

- Games are built in TurboWarp, exported as ZIPs, and deployed through `games-directory-page/scripts/build_arcade.py`.
- Extension changes take effect when Jay rebuilds and re-exports a game.
- `jay-mobile.js` v19.7 is a locked stable baseline. Do not modify it unless explicitly asked.

## Extension Conventions

- All extensions are unsandboxed (`Scratch.extensions.unsandboxed` required).
- Per-sprite state lives in a `targetStates` map keyed by sprite ID where applicable.
- Block text should stay game-facing rather than technical.
- Prefer silent runtime failure over exposing internals to players.

## Factory Network

`factory-network.js` is the multiplayer backbone for JayArcade online play.

- Backend: Node.js + `ws` on Railway
- Production URL: `wss://factory-network-server-production.up.railway.app`
- Planned custom domain: `wss://network.jayarcade.com`
- Local server path: `C:\Users\leoja\Desktop\Dad Games\full-games\factory-network-server`

Immediate priorities:

1. Switch to the custom domain once DNS is fully live.
2. Run a two-player end-to-end test.
3. Improve casual sync.
4. Add delay-based netcode for fighting games.
5. Treat rollback netcode as a later phase.

## Related Docs

- `factory_extensions/LEADERBOARD_SERVER.md`
- `factory_extensions/NAME_ENTRY.md`
