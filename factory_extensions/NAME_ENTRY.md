# Name Entry

The name entry system in `factory-leaderboards.js` handles the arcade-style letter picker
for entering a player's name before submitting a high score. It manages state only — cursor
position, which letter is selected at each slot, and assembling the final name string. You
control all display using `factory-text.js` and can wire any input you want (keyboard,
controller, mobile buttons).

---

## Alphabet

The picker cycles through 37 characters in this order:

```
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z 0 1 2 3 4 5 6 7 8 9 [space]
```

Scrolling wraps in both directions. Scrolling **up** from space loops back to A.
Scrolling **down** from A loops back to space.

---

## Block Reference

### `start name entry length [3]`
Resets the picker. All slots initialize to **A**, cursor starts at position **1**.
- `length` accepts 1–7. Values outside this range are clamped.
- Default 3 covers classic arcade tags (AAA). Use up to 7 for longer gamer tags.
- Call this every time you want to start fresh (e.g. when a score qualifies).

### `name entry move cursor [left v]`
Moves the cursor one slot left or right. Wraps around (moving right from the last
slot goes back to slot 1, and vice versa).

### `name entry scroll letter [up v]`
Cycles the letter at the **current cursor position** one step up or down through the
alphabet. Only the active slot is affected — other slots are untouched.

### `name entry cursor`
Returns the current cursor position as a **1-based number** (1 = leftmost slot).

### `name entry letter at [1]`
Returns the character currently selected at the given slot. Returns an empty string
for out-of-range positions.

### `name entry current name`
Returns the full assembled name string. **Trailing spaces are automatically trimmed** —
if a player leaves the last two slots at space, only the non-space prefix is returned.
Use this when submitting the score.

---

## Setting Up the Display with factory-text

Name entry has no built-in rendering. The recommended approach is one text object per
letter slot and a cursor indicator. Use `factory-text.js` to create and update them.

### Step 1 — Create the text objects

Run this once when name entry starts. Adjust x/y positions to fit your layout.

```
start name entry length [3]

write [A] as [ne_1]   at: x: [-30] y: [20]
write [A] as [ne_2]   at: x: [0]   y: [20]
write [A] as [ne_3]   at: x: [30]  y: [20]
write [>] as [ne_cur] at: x: [-30] y: [5]
```

Scale and style them to match your game:

```
set scale of all text to [4]
set color of text [ne_cur] to [#ffff00]
```

### Step 2 — Write a refresh procedure

Call this after every input. It syncs the display to the extension's current state.

```
define refresh name entry display
  set text [ne_1] to (name entry letter at [1])
  set text [ne_2] to (name entry letter at [2])
  set text [ne_3] to (name entry letter at [3])
  set text [ne_cur] x: (((name entry cursor) - [1]) * [30] + [-30])
  set color of text [ne_1] to [#ffffff]
  set color of text [ne_2] to [#ffffff]
  set color of text [ne_3] to [#ffffff]
  set color of text (join [ne_] (name entry cursor)) to [#ffff00]
```

The last two lines reset all slots to white, then highlight the active one in yellow.
Adjust the highlight color to match your game's palette.

### Step 3 — Wire your inputs

Use whatever keys or buttons suit your game. No keys are hardcoded.

```
when [left arrow v] pressed
  name entry move cursor [left v]
  refresh name entry display

when [right arrow v] pressed
  name entry move cursor [right v]
  refresh name entry display

when [up arrow v] pressed
  name entry scroll letter [up v]
  refresh name entry display

when [down arrow v] pressed
  name entry scroll letter [down v]
  refresh name entry display
```

### Step 4 — Confirm and submit

When the player confirms their name, read `name entry current name` and pass it
to the leaderboard blocks. Then clean up the text objects.

```
when [enter v] pressed
  add entry name (name entry current name) value (score) to leaderboard [High Scores]
  if <cloud leaderboard available ?> then
    submit to cloud player (name entry current name) score (score)
  end
  delete text [ne_1]
  delete text [ne_2]
  delete text [ne_3]
  delete text [ne_cur]
```

---

## Full Example — Score qualifies flow

```
define show name entry screen
  start name entry length [3]
  write [A] as [ne_1]   at: x: [-30] y: [20]
  write [A] as [ne_2]   at: x: [0]   y: [20]
  write [A] as [ne_3]   at: x: [30]  y: [20]
  write [>] as [ne_cur] at: x: [-30] y: [5]
  set scale of all text to [4]
  refresh name entry display
  set [entering name] to [1]

define refresh name entry display
  set text [ne_1] to (name entry letter at [1])
  set text [ne_2] to (name entry letter at [2])
  set text [ne_3] to (name entry letter at [3])
  set text [ne_cur] x: (((name entry cursor) - [1]) * [30] + [-30])
  set color of text [ne_1] to [#ffffff]
  set color of text [ne_2] to [#ffffff]
  set color of text [ne_3] to [#ffffff]
  set color of text (join [ne_] (name entry cursor)) to [#ffff00]

when game ends
  if <value (score) qualifies for leaderboard [High Scores] ?> then
    show name entry screen
  end

when [left arrow v] pressed
  if <(entering name) = [1]> then
    name entry move cursor [left v]
    refresh name entry display
  end

when [right arrow v] pressed
  if <(entering name) = [1]> then
    name entry move cursor [right v]
    refresh name entry display
  end

when [up arrow v] pressed
  if <(entering name) = [1]> then
    name entry scroll letter [up v]
    refresh name entry display
  end

when [down arrow v] pressed
  if <(entering name) = [1]> then
    name entry scroll letter [down v]
    refresh name entry display
  end

when [enter v] pressed
  if <(entering name) = [1]> then
    set [entering name] to [0]
    add entry name (name entry current name) value (score) to leaderboard [High Scores]
    if <cloud leaderboard available ?> then
      submit to cloud player (name entry current name) score (score)
      wait until not <(cloud sync status) = [loading]>
    end
    delete text [ne_1]
    delete text [ne_2]
    delete text [ne_3]
    delete text [ne_cur]
  end
```

---

## Notes

- **Cursor x-position formula:** `(cursor - 1) * slotSpacing + firstSlotX`. In the
  examples above, slot spacing is 30 and the first slot is at x -30. Adjust these to
  match your layout.
- **Longer names:** Change `length [3]` to anything up to `length [7]`. Add the
  extra `write` blocks and `set text` lines in your refresh procedure to match.
- **Mobile / controller input:** Replace `when [key] pressed` with whatever input
  blocks your game uses. The name entry blocks don't care what triggers them.
- **Submitting without cloud:** If cloud leaderboards aren't configured for the game,
  `cloud leaderboard available ?` returns false and the submit is skipped. Local
  leaderboard still works.
