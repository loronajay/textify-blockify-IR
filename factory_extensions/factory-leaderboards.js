(function(Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("Factory Leaderboards must run unsandboxed");
    }

    // TEMP TEST SHIM — remove before shipping
    if (typeof JayLeaderboard === "undefined") {
        window.JayLeaderboard = {
            submit: (playerName, score) => { console.log("[LeaderboardTest] submit:", playerName, score); return Promise.resolve({ ok: true }); },
            getTop: (limit = 10) => { console.log("[LeaderboardTest] getTop:", limit); return Promise.resolve([{rank:1,playerName:"AAA",score:9999},{rank:2,playerName:"BBB",score:8888},{rank:3,playerName:"CCC",score:7777}]); },
            deviceType: () => "desktop"
        };
    }
    // END TEMP TEST SHIM

    const boards = {};

    const NAME_ENTRY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
    const NAME_ENTRY_MAX_LENGTH = 7;

    function ensureBoard(name) {
        if (!boards[name]) {
            boards[name] = {
                entries: [],
                maxEntries: 10,
                sortMode: "desc" // desc = descending, asc = ascending
            };
        }
        return boards[name];
    }

    function getBoard(name) {
        return boards[name] || null;
    }

    function sortBoard(board) {
        board.entries.sort((a, b) => {
            if (board.sortMode === "asc") {
                return a.value - b.value;
            } else {
                return b.value - a.value;
            }
        });
    }

    function trimBoard(board) {
        if (board.entries.length > board.maxEntries) {
            board.entries.length = board.maxEntries;
        }
    }

    class FactoryLeaderboards {
        constructor() {
            this._syncStatus = "idle";
            this._nameEntryChars = [];
            this._nameEntryCursor = 0;
        }

        getInfo() {
            return {
                id: "factoryleaderboards",
                name: "Factory Leaderboards",
                blocks: [

                    // Setup
                    {
                        opcode: "createLeaderboard",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "create leaderboard [NAME]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "deleteLeaderboard",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "delete leaderboard [NAME]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "deleteAllLeaderboards",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "delete all leaderboards"
                    },
                    {
                        opcode: "setMaxEntries",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set leaderboard [NAME] max entries to [NUM]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" },
                            NUM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 }
                        }
                    },
                    {
                        opcode: "setSortMode",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "set leaderboard [NAME] sort mode to [MODE]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" },
                            MODE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "sortMode"
                            }
                        }
                    },

                    // Entry
                    {
                        opcode: "addEntry",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "add entry name [PLAYER] value [VALUE] to leaderboard [NAME]",
                        arguments: {
                            PLAYER: { type: Scratch.ArgumentType.STRING, defaultValue: "AAA" },
                            VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "clearLeaderboard",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "clear leaderboard [NAME]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "trimLeaderboard",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "trim leaderboard [NAME]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },

                    // Logic
                    {
                        opcode: "qualifies",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "value [VALUE] qualifies for leaderboard [NAME] ?",
                        arguments: {
                            VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "getRank",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "get rank for value [VALUE] in leaderboard [NAME]",
                        arguments: {
                            VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "isFull",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "leaderboard [NAME] is full ?",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },

                    // Retrieval
                    {
                        opcode: "entryCount",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "entry count of leaderboard [NAME]",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "getName",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "name at rank [RANK] in leaderboard [NAME]",
                        arguments: {
                            RANK: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "getValue",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "value at rank [RANK] in leaderboard [NAME]",
                        arguments: {
                            RANK: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "formattedRow",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "leaderboard row [RANK] from [NAME]",
                        arguments: {
                            RANK: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },

                    // Utility
                    {
                        opcode: "exists",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "leaderboard [NAME] exists ?",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "hasEntries",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "has entries in leaderboard [NAME] ?",
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },

                    // Name Entry
                    {
                        opcode: "startNameEntry",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "start name entry length [LENGTH]",
                        arguments: {
                            LENGTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 }
                        }
                    },
                    {
                        opcode: "nameEntryMoveCursor",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "name entry move cursor [DIRECTION]",
                        arguments: {
                            DIRECTION: { type: Scratch.ArgumentType.STRING, menu: "cursorDirection" }
                        }
                    },
                    {
                        opcode: "nameEntryScrollLetter",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "name entry scroll letter [DIRECTION]",
                        arguments: {
                            DIRECTION: { type: Scratch.ArgumentType.STRING, menu: "scrollDirection" }
                        }
                    },
                    {
                        opcode: "nameEntryCursor",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "name entry cursor"
                    },
                    {
                        opcode: "nameEntryLetterAt",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "name entry letter at [POS]",
                        arguments: {
                            POS: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    {
                        opcode: "nameEntryCurrentName",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "name entry current name"
                    },

                    // Cloud Sync
                    {
                        opcode: "cloudAvailable",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "cloud leaderboard available ?"
                    },
                    {
                        opcode: "submitToCloud",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "submit to cloud player [PLAYER] score [VALUE]",
                        arguments: {
                            PLAYER: { type: Scratch.ArgumentType.STRING, defaultValue: "AAA" },
                            VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }
                        }
                    },
                    {
                        opcode: "fetchFromCloud",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "fetch top [LIMIT] scores from cloud into leaderboard [NAME]",
                        arguments: {
                            LIMIT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: "High Scores" }
                        }
                    },
                    {
                        opcode: "cloudSyncStatus",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "cloud sync status"
                    }
                ],
                menus: {
                    cursorDirection: {
                        acceptReporters: true,
                        items: [
                            { text: "left", value: "left" },
                            { text: "right", value: "right" }
                        ]
                    },
                    scrollDirection: {
                        acceptReporters: true,
                        items: [
                            { text: "up", value: "up" },
                            { text: "down", value: "down" }
                        ]
                    },
                    sortMode: {
                        acceptReporters: true,
                        items: [
                            { text: "descending", value: "desc" },
                            { text: "ascending", value: "asc" }
                        ]
                    }
                }
            };
        }

        createLeaderboard({ NAME }) {
            ensureBoard(NAME);
        }

        deleteLeaderboard({ NAME }) {
            delete boards[NAME];
        }

        deleteAllLeaderboards() {
            for (let key in boards) delete boards[key];
        }

        setMaxEntries({ NAME, NUM }) {
            const board = ensureBoard(NAME);
            board.maxEntries = Math.max(1, Math.floor(NUM));
            trimBoard(board);
        }

        setSortMode({ NAME, MODE }) {
            const board = ensureBoard(NAME);
            board.sortMode = MODE === "asc" ? "asc" : "desc";
            sortBoard(board);
        }

        addEntry({ PLAYER, VALUE, NAME }) {
            const board = ensureBoard(NAME);
            board.entries.push({ name: PLAYER, value: Number(VALUE) || 0 });
            sortBoard(board);
            trimBoard(board);
        }

        clearLeaderboard({ NAME }) {
            const board = ensureBoard(NAME);
            board.entries = [];
        }

        trimLeaderboard({ NAME }) {
            const board = ensureBoard(NAME);
            trimBoard(board);
        }

        qualifies({ VALUE, NAME }) {
            const board = getBoard(NAME);
            const value = Number(VALUE) || 0;

            if (!board) return false;

            if (board.entries.length < board.maxEntries) return true;

            const last = board.entries[board.entries.length - 1];
            return board.sortMode === "asc"
                ? value < last.value
                : value > last.value;
        }

        getRank({ VALUE, NAME }) {
            const board = getBoard(NAME);
            const value = Number(VALUE) || 0;

            if (!board) return 0;

            for (let i = 0; i < board.entries.length; i++) {
                if (
                    (board.sortMode === "asc" && value < board.entries[i].value) ||
                    (board.sortMode === "desc" && value > board.entries[i].value)
                ) {
                    return i + 1;
                }
            }
            return board.entries.length + 1;
        }

        isFull({ NAME }) {
            const board = getBoard(NAME);
            if (!board) return false;
            return board.entries.length >= board.maxEntries;
        }

        entryCount({ NAME }) {
            const board = getBoard(NAME);
            return board ? board.entries.length : 0;
        }

        getName({ RANK, NAME }) {
            const board = getBoard(NAME);
            if (!board) return "";
            const entry = board.entries[RANK - 1];
            return entry ? entry.name : "";
        }

        getValue({ RANK, NAME }) {
            const board = getBoard(NAME);
            if (!board) return 0;
            const entry = board.entries[RANK - 1];
            return entry ? entry.value : 0;
        }

        formattedRow({ RANK, NAME }) {
            const board = getBoard(NAME);
            if (!board) return "";
            const rank = Math.floor(Number(RANK));
            const entry = board.entries[rank - 1];
            if (!entry) return "";
            const r = String(rank).padStart(2);
            const n = String(entry.name).padEnd(7);
            const s = String(entry.value).padStart(5);
            return `${r}  ${n}  ${s}`;
        }

        exists({ NAME }) {
            return !!boards[NAME];
        }

        hasEntries({ NAME }) {
            const board = getBoard(NAME);
            return !!(board && board.entries.length > 0);
        }

        startNameEntry({ LENGTH }) {
            const raw = Math.floor(Number(LENGTH));
            const len = Math.min(NAME_ENTRY_MAX_LENGTH, Math.max(1, isNaN(raw) ? 3 : raw));
            this._nameEntryChars = new Array(len).fill(0);
            this._nameEntryCursor = 0;
        }

        nameEntryMoveCursor({ DIRECTION }) {
            const len = this._nameEntryChars.length;
            if (!len) return;
            if (DIRECTION === "right") {
                this._nameEntryCursor = (this._nameEntryCursor + 1) % len;
            } else {
                this._nameEntryCursor = (this._nameEntryCursor - 1 + len) % len;
            }
        }

        nameEntryScrollLetter({ DIRECTION }) {
            if (!this._nameEntryChars.length) return;
            const i = this._nameEntryCursor;
            if (DIRECTION === "up") {
                this._nameEntryChars[i] = (this._nameEntryChars[i] + 1) % NAME_ENTRY_ALPHABET.length;
            } else {
                this._nameEntryChars[i] = (this._nameEntryChars[i] - 1 + NAME_ENTRY_ALPHABET.length) % NAME_ENTRY_ALPHABET.length;
            }
        }

        nameEntryCursor() {
            return this._nameEntryCursor + 1;
        }

        nameEntryLetterAt({ POS }) {
            const i = Math.floor(Number(POS)) - 1;
            if (i < 0 || i >= this._nameEntryChars.length) return "";
            return NAME_ENTRY_ALPHABET[this._nameEntryChars[i]];
        }

        nameEntryCurrentName() {
            return this._nameEntryChars
                .map(i => NAME_ENTRY_ALPHABET[i])
                .join("")
                .trimEnd();
        }

        cloudAvailable() {
            return typeof JayLeaderboard !== "undefined" && !!JayLeaderboard;
        }

        async submitToCloud({ PLAYER, VALUE }) {
            if (typeof JayLeaderboard === "undefined") return;
            this._syncStatus = "loading";
            try {
                await JayLeaderboard.submit(String(PLAYER), Number(VALUE) || 0);
                this._syncStatus = "success";
            } catch (e) {
                this._syncStatus = "error";
            }
        }

        async fetchFromCloud({ LIMIT, NAME }) {
            if (typeof JayLeaderboard === "undefined") return;
            this._syncStatus = "loading";
            try {
                const entries = await JayLeaderboard.getTop(Number(LIMIT) || 10);
                const board = ensureBoard(NAME);
                board.entries = [];
                for (const entry of entries) {
                    board.entries.push({ name: entry.playerName, value: Number(entry.score) || 0 });
                    sortBoard(board);
                    trimBoard(board);
                }
                this._syncStatus = "success";
            } catch (e) {
                this._syncStatus = "error";
            }
        }

        cloudSyncStatus() {
            return this._syncStatus;
        }
    }

    Scratch.extensions.register(new FactoryLeaderboards());
})(Scratch);
