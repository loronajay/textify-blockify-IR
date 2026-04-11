# Leaderboard Quickstart

How to add cloud leaderboards to any JayArcade game.

---

## Requirements

Load both extensions in TurboWarp before using any leaderboard blocks:
- `factory-leaderboards.js`
- `factory-text.js`

---

## How It Works

Factory Leaderboards has two layers:

- **Local leaderboard** — an in-memory ranked list you create and manage in-game. Always available.
- **Cloud leaderboard** — synced to the Railway server. Only available in deployed games (the `JayLeaderboard` helper is injected by the build pipeline). Blocks silently no-op in TurboWarp Desktop.

The typical flow: fetch cloud scores into a local leaderboard on game start → display from local → when game ends, check if score qualifies → show name entry → submit to cloud.

---

## Full End-to-End Flow

### 1. On game start — fetch and display

```
when green flag clicked
  create leaderboard [High Scores]
  set leaderboard [High Scores] max entries to [10]
  if <cloud leaderboard available ?> then
    fetch top [10] scores from cloud into leaderboard [High Scores]
    wait until not <(cloud sync status) = [loading]>
  end
  show leaderboard display
```

`define show leaderboard display` — see Rendering below.

---

### 2. On game end — qualify, name entry, submit

```
define handle game over
  if <cloud leaderboard available ?> then
    if <value (score) qualifies for leaderboard [High Scores] ?> then
      broadcast [Show Name Entry] and wait
      submit to cloud player (name entry current name) score (score)
      wait until not <(cloud sync status) = [loading]>
      fetch top [10] scores from cloud into leaderboard [High Scores]
      wait until not <(cloud sync status) = [loading]>
    end
  end
  show leaderboard display
```

The re-fetch after submitting ensures the displayed board reflects the new score.

---

### 3. Name entry

See **NAME_ENTRY.md** for the full name entry block reference and wiring guide.

Quick summary — broadcast `[Show Name Entry]` from your game logic. In your Leaderboard sprite:

```
when I receive [Show Name Entry]
  start name entry length [3]
  write [A] as [ne_1]   at: x: [-30] y: [20]
  write [A] as [ne_2]   at: x: [0]   y: [20]
  write [A] as [ne_3]   at: x: [30]  y: [20]
  write [>] as [ne_cur] at: x: [-30] y: [5]
  set scale of all text to [4]
  refresh name entry display
  set [entering name] to [1]
  wait until <(entering name) = [0]>
```

---

## Rendering the Leaderboard

Use `leaderboard row [RANK] from [NAME]` to get a pre-formatted line ready to pass directly to a `write` or `set text` block.

Format: `" 1  AAA    10000"` — rank right-aligned to 2, name left-padded to 7, score right-aligned to 5. Returns empty string for out-of-bounds ranks.

### Initial render (call once to create text objects)

```
define show leaderboard display
  set [i] to [1]
  repeat [10]
    write (leaderboard row (i) from [High Scores]) as (join [lb_] (i)) at: x: [-80] y: (160 - ((i - 1) * 20))
    change [i] by [1]
  end
```

### Refresh (call after fetch to update existing text objects)

```
define refresh leaderboard display
  set [i] to [1]
  repeat [10]
    set text (join [lb_] (i)) to (leaderboard row (i) from [High Scores])
    change [i] by [1]
  end
```

Adjust `x`, starting `y`, and row spacing (`* 20`) to fit your game's layout.

### If you need name or score separately

```
name at rank [1] in leaderboard [High Scores]
value at rank [1] in leaderboard [High Scores]
```

---

## Block Reference

### Setup
| Block | What it does |
|---|---|
| `create leaderboard [NAME]` | Initializes a named leaderboard. Call before using it. |
| `set leaderboard [NAME] max entries to [NUM]` | Caps the entry count. Default 10. |
| `set leaderboard [NAME] sort mode to [descending]` | `descending` = high score first (default). `ascending` = low score first. |
| `clear leaderboard [NAME]` | Removes all entries. |
| `delete leaderboard [NAME]` | Removes the leaderboard entirely. |

### Adding Entries
| Block | What it does |
|---|---|
| `add entry name [PLAYER] value [VALUE] to leaderboard [NAME]` | Adds a local entry, sorts, and trims to max. |

### Reading Entries
| Block | What it does |
|---|---|
| `leaderboard row [RANK] from [NAME]` | Formatted string: `" 1  AAA    10000"`. Empty if rank doesn't exist. |
| `name at rank [RANK] in leaderboard [NAME]` | Player name at that rank. |
| `value at rank [RANK] in leaderboard [NAME]` | Score at that rank. |
| `entry count of leaderboard [NAME]` | How many entries currently in the board. |

### Logic
| Block | What it does |
|---|---|
| `value [VALUE] qualifies for leaderboard [NAME] ?` | True if the value would make the cut. |
| `get rank for value [VALUE] in leaderboard [NAME]` | Where this value would land (1-based). |
| `leaderboard [NAME] is full ?` | True if at max entries. |
| `has entries in leaderboard [NAME] ?` | True if at least one entry exists. |
| `leaderboard [NAME] exists ?` | True if the leaderboard has been created. |

### Cloud Sync
| Block | What it does |
|---|---|
| `cloud leaderboard available ?` | True in deployed games with JayLeaderboard injected. |
| `fetch top [10] scores from cloud into leaderboard [NAME]` | Overwrites local board with cloud data. Async. |
| `submit to cloud player [PLAYER] score [VALUE]` | Posts score to server. Async. |
| `cloud sync status` | `idle` / `loading` / `success` / `error` |

### Name Entry
See **NAME_ENTRY.md** for the full reference.

| Block | What it does |
|---|---|
| `start name entry length [3]` | Resets picker. All slots → A, cursor → slot 1. |
| `name entry move cursor [left]` | Move cursor left or right (wraps). |
| `name entry scroll letter [up]` | Cycle letter at cursor up or down. |
| `name entry cursor` | Current cursor position (1-based). |
| `name entry letter at [1]` | Character selected at that slot. |
| `name entry current name` | Full assembled name (trailing spaces trimmed). |

---

## Customisation

| Thing to change | Where |
|---|---|
| Name length (1–7 chars) | `start name entry length [3]` |
| Number of scores displayed | Change `repeat [10]` and `max entries` |
| Row spacing | Change `* 20` in the y formula |
| Text position | Adjust `x` and starting `y` in the render define |
| Score sort order | `set leaderboard sort mode to [ascending]` for time-based games |
| Controls for name entry | See NAME_ENTRY.md — any input works |
