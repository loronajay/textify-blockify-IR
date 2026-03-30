(function(Scratch) {
    "use strict";

    if (!Scratch.extensions.unsandboxed) {
        throw new Error("Factory Network must run unsandboxed");
    }

    const SERVER_URL = "wss://factory-network-server-production.up.railway.app";
    const PING_INTERVAL = 5000;   // send ping every 5s
    const PONG_TIMEOUT  = 15000;  // disconnect if no pong for 15s

    function slugify(name) {
        return name
            .toLowerCase()
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function getProjectSlug() {
        if (typeof document === 'undefined') return '';
        const title = document.title || '';
        const name = title.replace(/\s*[-–]\s*TurboWarp\s*$/i, '').trim();
        return slugify(name);
    }

    let socket = null;
    let connectionToken = 0;
    let _heartbeatInterval = null;
    let _lastPong = 0;

    let _status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    let _lastError = '';
    let _searching = false;
    let _connected = false;
    let _clientId = '';
    let _roomId = '';

    // Message queue — incoming messages are buffered so none are lost
    // between Scratch VM polls regardless of how fast they arrive.
    let _msgQueue = [];                                     // pending messages
    let _currentMsg = { type: '', value: '', sender: '' }; // last dequeued

    let _lastJoined = '';
    let _lastLeft = '';
    let _joinedFlag = false;
    let _leftFlag = false;

    function clearHeartbeat() {
        if (_heartbeatInterval) {
            clearInterval(_heartbeatInterval);
            _heartbeatInterval = null;
        }
    }

    function resetState(preserveError) {
        clearHeartbeat();
        _status = preserveError ? 'error' : 'disconnected';
        _searching = false;
        _connected = false;
        _clientId = '';
        _roomId = '';
        _msgQueue = [];
        _currentMsg = { type: '', value: '', sender: '' };
        _lastJoined = '';
        _lastLeft = '';
        _joinedFlag = false;
        _leftFlag = false;
    }

    function handleServerMessage(data) {
        const msg = JSON.parse(data);
        switch (msg.event) {
            case 'connected':
                _status = 'connected';
                _connected = true;
                _clientId = String(msg.clientId || '');
                break;
            case 'room_joined':
                _roomId = String(msg.roomCode || '');
                _searching = false;
                break;
            case 'searching':
                _searching = true;
                break;
            case 'search_cancelled':
                _searching = false;
                break;
            case 'room_left':
                _roomId = '';
                break;
            case 'player_joined':
                _lastJoined = String(msg.clientId || '');
                _joinedFlag = true;
                break;
            case 'player_left':
                _lastLeft = String(msg.clientId || '');
                _leftFlag = true;
                break;
            case 'message':
                _msgQueue.push({
                    type:   String(msg.messageType || ''),
                    value:  String(msg.value || ''),
                    sender: String(msg.senderId || '')
                });
                break;
            case 'pong':
                _lastPong = Date.now();
                break;
            case 'error':
                break;
        }
    }

    class FactoryNetwork {
        getInfo() {
            return {
                id: "factorynetwork",
                name: "Factory Network",
                blocks: [

                    // --- Connection ---
                    {
                        opcode: "connect",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "connect to network"
                    },
                    {
                        opcode: "disconnect",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "disconnect from network"
                    },
                    {
                        opcode: "isConnected",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "connected?"
                    },
                    {
                        opcode: "myId",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "my player ID"
                    },
                    {
                        opcode: "connectionStatus",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "connection status"
                    },
                    {
                        opcode: "lastError",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last connection error"
                    },

                    // --- Rooms ---
                    {
                        opcode: "createRoom",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "create room"
                    },
                    {
                        opcode: "joinRoom",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "join room [ROOM]",
                        arguments: {
                            ROOM: { type: Scratch.ArgumentType.STRING, defaultValue: "" }
                        }
                    },
                    {
                        opcode: "leaveRoom",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "leave room"
                    },
                    {
                        opcode: "findMatch",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "find a match"
                    },
                    {
                        opcode: "cancelMatch",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "cancel match search"
                    },
                    {
                        opcode: "isSearching",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "searching for match?"
                    },
                    {
                        opcode: "inRoom",
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: "in a room?"
                    },
                    {
                        opcode: "myRoom",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "my room"
                    },
                    {
                        opcode: "gameId",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "game id"
                    },

                    // --- Messaging ---
                    {
                        opcode: "sendRoomMessage",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "send room message [TYPE] with value [VALUE]",
                        arguments: {
                            TYPE: { type: Scratch.ArgumentType.STRING, defaultValue: "score" },
                            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "0" }
                        }
                    },
                    {
                        opcode: "sendDirectMessage",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "send direct message [TYPE] with value [VALUE] to [TARGET]",
                        arguments: {
                            TYPE: { type: Scratch.ArgumentType.STRING, defaultValue: "score" },
                            VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "0" },
                            TARGET: { type: Scratch.ArgumentType.STRING, defaultValue: "" }
                        }
                    },

                    // --- Event hats ---
                    {
                        opcode: "whenMessageReceived",
                        blockType: Scratch.BlockType.HAT,
                        text: "when message received",
                        isEdgeActivated: false
                    },
                    {
                        opcode: "whenPlayerJoined",
                        blockType: Scratch.BlockType.HAT,
                        text: "when player joined",
                        isEdgeActivated: false
                    },
                    {
                        opcode: "whenPlayerLeft",
                        blockType: Scratch.BlockType.HAT,
                        text: "when player left",
                        isEdgeActivated: false
                    },

                    // --- Received data ---
                    {
                        opcode: "lastMessageType",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last message type"
                    },
                    {
                        opcode: "lastMessageValue",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last message value"
                    },
                    {
                        opcode: "lastMessageSender",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last message sender"
                    },
                    {
                        opcode: "lastJoinedPlayer",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last player who joined"
                    },
                    {
                        opcode: "lastLeftPlayer",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "last player who left"
                    },
                    {
                        opcode: "messagesWaiting",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "messages waiting"
                    }
                ]
            };
        }

        connect() {
            if (socket) return;
            const token = ++connectionToken;
            _status = 'connecting';
            _lastPong = Date.now();
            socket = new WebSocket(SERVER_URL);
            socket.onmessage = (event) => {
                if (connectionToken !== token) return;
                try { handleServerMessage(event.data); } catch (e) {}
            };
            socket.onclose = (event) => {
                if (connectionToken !== token) return;
                const hadError = _status === 'error';
                if (!hadError) {
                    _lastError = event.code ? `closed (code ${event.code})` : 'connection closed';
                }
                socket = null;
                resetState(hadError);
            };
            socket.onerror = () => {
                if (connectionToken !== token) return;
                _lastError = `failed to connect to ${SERVER_URL}`;
                _status = 'error';
            };

            // Heartbeat — ping every PING_INTERVAL, disconnect if pong
            // doesn't arrive within PONG_TIMEOUT.
            _heartbeatInterval = setInterval(() => {
                if (connectionToken !== token) {
                    clearInterval(_heartbeatInterval);
                    return;
                }
                if (Date.now() - _lastPong > PONG_TIMEOUT) {
                    clearInterval(_heartbeatInterval);
                    _lastError = 'connection timed out';
                    connectionToken++;
                    if (socket) { socket.close(); socket = null; }
                    resetState(true);
                    return;
                }
                if (socket && socket.readyState === 1) {
                    socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, PING_INTERVAL);
        }

        disconnect() {
            clearHeartbeat();
            connectionToken++;
            if (socket) {
                socket.close();
                socket = null;
            }
            resetState();
        }

        isConnected() {
            return _connected;
        }

        myId() {
            return _clientId;
        }

        connectionStatus() {
            return _status;
        }

        lastError() {
            return _lastError;
        }

        createRoom() {
            if (!_connected || !socket) return;
            socket.send(JSON.stringify({ type: 'create_room' }));
        }

        joinRoom({ ROOM }) {
            if (!_connected || !socket) return;
            socket.send(JSON.stringify({ type: 'join_room', roomCode: ROOM }));
        }

        leaveRoom() {
            if (!_connected || !socket) return;
            socket.send(JSON.stringify({ type: 'leave_room' }));
        }

        findMatch() {
            if (!_connected || !socket) return;
            socket.send(JSON.stringify({ type: 'find_match', gameId: getProjectSlug() }));
        }

        cancelMatch() {
            if (!_connected || !socket) return;
            socket.send(JSON.stringify({ type: 'cancel_match' }));
        }

        isSearching() {
            return _searching;
        }

        inRoom() {
            return _roomId !== '';
        }

        myRoom() {
            return _roomId;
        }

        gameId() {
            return getProjectSlug();
        }

        sendRoomMessage({ TYPE, VALUE }) {
            if (!_connected || !socket || _roomId === '') return;
            socket.send(JSON.stringify({ type: 'room_message', messageType: TYPE, value: VALUE }));
        }

        sendDirectMessage({ TYPE, VALUE, TARGET }) {
            if (!_connected || !socket) return;
            socket.send(JSON.stringify({ type: 'direct_message', targetId: TARGET, messageType: TYPE, value: VALUE }));
        }

        // Drains one message from the queue per poll. If multiple messages
        // arrived between polls, the hat fires again next poll for the next
        // one — nothing is skipped.
        whenMessageReceived() {
            if (_msgQueue.length === 0) return false;
            _currentMsg = _msgQueue.shift();
            return true;
        }

        whenPlayerJoined() {
            const v = _joinedFlag;
            _joinedFlag = false;
            return v;
        }

        whenPlayerLeft() {
            const v = _leftFlag;
            _leftFlag = false;
            return v;
        }

        lastMessageType() {
            return _currentMsg.type;
        }

        lastMessageValue() {
            return _currentMsg.value;
        }

        lastMessageSender() {
            return _currentMsg.sender;
        }

        lastJoinedPlayer() {
            return _lastJoined;
        }

        lastLeftPlayer() {
            return _lastLeft;
        }

        messagesWaiting() {
            return _msgQueue.length;
        }
    }

    Scratch.extensions.register(new FactoryNetwork());
})(Scratch);
