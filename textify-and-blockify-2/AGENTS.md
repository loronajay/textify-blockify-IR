# AGENTS.md

This file governs Codex work inside `textify-and-blockify-2/`.

It extends the repo-root `AGENTS.md` for this folder and is the Codex equivalent of `textify-and-blockify-2/CLAUDE.md`.

## Vision

Textify/Blockify 2 (TB2) is the foundation for a prompt-to-blocks game engine. The end state is that a user describes a change, an agent proposes IR-backed block edits, the user approves or rejects them, and TurboWarp updates live without clipboard or terminal steps.

## Hard Boundaries

- `IR_GRAMMAR.md` is mandatory source of truth for all IR.
- Textify 2 is the only reader of project state.
- Blockify 2 is the only writer into the VM.
- Every change must go through preview and explicit approve/reject.
- Blockify 2 owns validation; nothing commits unless parse + validate succeed.

## Phase Status

- Phase 1: VM writer complete
- Phase 2: Preview / validation UI complete
- Phase 3: Local bridge complete
- Phase 4: Bridge client complete
- Phase 5: Agent protocol complete
- Phase 5B: MCP server + auto-connect complete
- Phase 5C: Self-contained prompt UI complete
- Phase 5D: Targeted mutation — planning
- Phase 6: TurboWarp fork — future

## Codex Path

TB2's Phase 5B MCP server works for Codex because Codex supports project-scoped stdio MCP servers via `.codex/config.toml`.

Expected Codex session flow:

1. Open Codex in the repo root and trust the project.
2. Codex loads `.codex/config.toml`, which registers the `tb2` MCP server.
3. Load `blockify-turbowarp-2.embedded.js` and `textify-turbowarp-2.js` in TurboWarp Desktop.
4. Ask Codex to start the bridge.
5. Codex calls `tb2_start_bridge`.
6. TurboWarp auto-connects within a few seconds.
7. Codex uses `tb2_status`, `tb2_get_state`, `tb2_get_sprite`, and `tb2_propose`.
8. The user approves or rejects in TurboWarp.

Codex live-session notes from Windows desktop verification:

- This flow has now been exercised successfully in Codex desktop: bridge status check, TurboWarp connected, `Sprite1` state fetched, IR proposed, user approved, blocks appeared.
- If Codex uses manual PowerShell HTTP calls instead of MCP tools, `Invoke-WebRequest` should include `-UseBasicParsing`.
- Local Node-based IR validation from Codex desktop may hit sandbox-related filesystem access errors; if that happens, rerun the validation with escalation rather than skipping validation.

## Runtime Notes

TurboWarp Desktop specifics already confirmed for TB2:

- Unsandboxed extensions load correctly.
- `Scratch.vm.runtime.ext_<id>` is not populated for TB2 in TurboWarp Desktop.
- Use `globalThis.__tb2Blockify` in DevTools when you need the Blockify 2 instance.
- `Scratch.vm.extensionManager.isExtensionLoaded('blockify2')` returns `true` when loaded.

## Files In Scope

- `textify-and-blockify-2/textify-turbowarp-2.js`
- `textify-and-blockify-2/blockify-turbowarp-2.js`
- `textify-and-blockify-2/bridge/bridge.js`
- `textify-and-blockify-2/agent/*`
- `textify-and-blockify-2/__tests__/*`
- `textify-and-blockify-2/planning-documents/*`

Never edit `blockify-turbowarp-2.embedded.js` directly. Edit source, then rebuild.

## Commands

```bash
npx jest textify-and-blockify-2
npx jest textify-and-blockify-2/__tests__/blockify2-vm-writer.test.js
npx jest textify-and-blockify-2/agent
npm run build:blockify2
```

## Implementation Rules

- Use TDD when making production code changes.
- Do not add features beyond the current phase plan.
- Do not modify the inherited parser or validator unless a real bug is confirmed.
- After editing `blockify-turbowarp-2.js`, run TB2 tests and rebuild the embedded artifact.
- Bridge code in `bridge/` is plain Node.js and does not need a build step.
