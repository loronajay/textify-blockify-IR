# Factory Network

Factory Network lets you add online multiplayer to your TurboWarp games. Two players can connect, get paired together automatically, and send messages back and forth — all using simple blocks, no backend knowledge required.

---

## Loading the extension

1. Open your project in TurboWarp.
2. Click the **Extensions** button (puzzle piece, bottom-left).
3. Click **Custom Extension** and load `factory-network.js`.
4. Accept the unsandboxed prompt — the extension needs it to use WebSockets.

---

## How it works

Every multiplayer session follows the same three steps:

```
Connect → Find a match → Send and receive messages
```

Players connect to the network individually, then call **find a match**. The server pairs the first two players looking for the same game and puts them in a shared room. From that point on, they can message each other.

---

## Step 1 — Connecting

```
when green flag clicked
connect to network
wait until <connected?>
say (my player ID)
```

- **`connect to network`** opens a connection to the server. It's fire-and-forget — the connection happens in the background.
- **`connected?`** returns false until the server confirms the connection. Use it with `wait until` before doing anything else.
- **`my player ID`** is the unique ID the server assigned to this player (e.g. `c_3fa2b1c0`). It stays the same for the whole session.
- **`connection status`** returns one of: `connecting`, `connected`, `error`, or `disconnected`. Useful for showing a status indicator or debugging.

> **Note:** Call `connect to network` once at the start. Don't call it again unless you've disconnected first.

---

## Step 2 — Finding a match

```
when green flag clicked
connect to network
wait until <connected?>
find a match
wait until <in a room?>
say (join [matched! room: ] (my room))
```

- **`find a match`** puts this player in a queue. The server automatically pairs the first two players queued for the same game and places them in a shared room.
- The game ID is derived automatically from your project's name — no setup needed. A project named **"Apple Catcher"** uses the ID `apple-catcher`. You can check what ID your project is using with the **`game id`** reporter.
- **`searching for match?`** returns true while waiting in the queue, false once matched or cancelled.
- **`in a room?`** becomes true once the match is found.
- **`my room`** returns the room code (e.g. `9SBUQ`).

To cancel while searching:
```
cancel match search
```

---

## Step 3 — Sending messages

Once both players are in a room, they can send messages to each other.

### Send a message to everyone in the room

```
send room message [score] with value [100]
```

Use **message type** to describe what the message is about (e.g. `score`, `position`, `health`, `event`). Use **value** for the data. Both are plain text.

### Send a message to a specific player

```
send direct message [taunt] with value [nice try] to (my player ID)
```

Replace `(my player ID)` with the target player's ID. You can get the other player's ID from **`last message sender`** or **`last player who joined`**.

---

## Step 4 — Receiving messages

Use the hat block to react whenever a message arrives:

```
when message received
if <(last message type) = [score]> then
  set [their score] to (last message value)
end
```

- **`last message type`** — the type string from the sender's message.
- **`last message value`** — the value string.
- **`last message sender`** — the player ID of whoever sent it.

The hat fires once per message. The data reporters hold their values until the next message overwrites them.

---

## Reacting to players joining and leaving

```
when player joined
say (join (last player who joined) [ joined!])

when player left
say (join (last player who left) [ left.])
```

- **`when player joined`** fires when the second player enters your room.
- **`when player left`** fires when the other player disconnects or leaves.
- Use **`last player who joined`** and **`last player who left`** to get their IDs.

---

## Disconnecting

```
when green flag clicked
...

when I receive [quit]
disconnect from network
```

**`disconnect from network`** closes the connection and clears all state. The other player will receive a **player left** event. Calling `connect to network` again starts a fresh session.

---

## Manual rooms (optional)

If you want players to join a specific room by code instead of using automatic matchmaking:

```
// Player 1
create room
wait until <in a room?>
say (join [room code: ] (my room))   ← share this code with player 2

// Player 2
join room [9SBUQ]                    ← enter the code player 1 shared
wait until <in a room?>
```

Rooms hold a maximum of 2 players. The server generates the room code — you can't choose it.

---

## Full example: score sync

```
// Both players run this at the start
when green flag clicked
connect to network
wait until <connected?>
find a match
wait until <in a room?>
set [ready] to [1]

// Send score whenever it changes
when [score v] changes
send room message [score] with value (score)

// Receive opponent's score
when message received
if <(last message type) = [score]> then
  set [their score] to (last message value)
end

// Detect opponent leaving
when player left
say [opponent disconnected]
stop all
```

---

## Block reference

### Connection

| Block | Type | Description |
|---|---|---|
| `connect to network` | Command | Opens connection to the server |
| `disconnect from network` | Command | Closes connection, clears all state |
| `connected?` | Boolean | True once server confirms connection |
| `my player ID` | Reporter | Your unique ID for this session |
| `connection status` | Reporter | `connecting` / `connected` / `error` / `disconnected` |
| `last connection error` | Reporter | Error detail if status is `error` |

### Matchmaking

| Block | Type | Description |
|---|---|---|
| `find a match` | Command | Queues for automatic 1v1 matchmaking |
| `cancel match search` | Command | Leaves the queue |
| `searching for match?` | Boolean | True while waiting in queue |
| `game id` | Reporter | The auto-generated ID for your project |

### Rooms

| Block | Type | Description |
|---|---|---|
| `create room` | Command | Creates a new room (server assigns code) |
| `join room [CODE]` | Command | Joins an existing room by code |
| `leave room` | Command | Leaves the current room |
| `in a room?` | Boolean | True when inside a room |
| `my room` | Reporter | The current room code |

### Messaging

| Block | Type | Description |
|---|---|---|
| `send room message [TYPE] with value [VALUE]` | Command | Sends to all players in your room |
| `send direct message [TYPE] with value [VALUE] to [TARGET]` | Command | Sends to one specific player |

### Events

| Block | Type | Description |
|---|---|---|
| `when message received` | Hat | Fires when a message arrives |
| `when player joined` | Hat | Fires when another player enters your room |
| `when player left` | Hat | Fires when a player leaves your room |
| `last message type` | Reporter | Type from the most recent message |
| `last message value` | Reporter | Value from the most recent message |
| `last message sender` | Reporter | Player ID of the most recent sender |
| `last player who joined` | Reporter | Player ID of the most recent joiner |
| `last player who left` | Reporter | Player ID of the most recent leaver |
