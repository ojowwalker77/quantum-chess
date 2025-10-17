# quantum chess

multiplayer chess where quantum mechanics hide your moves

## concept

when you move a piece, your opponent sees only probabilities, not the exact position. the quantum state collapses (becomes certain) only when:
- you capture a piece
- you put their king in check

## setup

1. build the wasm:
```bash
zig build
```

2. install dependencies:
```bash
npm install
```

3. start server:
```bash
npm start
```

4. open `http://localhost:8080` in two browser windows/tabs

## how to play

1. player 1: click "create room" → share the room code
2. player 2: enter room code → click "join room"
3. play chess, but opponent sees probability distributions
4. capture or check to reveal your position

## files

```
├── src/
│   ├── main.zig          - wasm interface
│   ├── chess.zig         - chess logic
│   └── quantum.zig       - quantum state
├── server.js             - websocket server
├── app.js                - client logic
├── index.html            - ui
└── package.json          - node deps
```

## technical

- zig → webassembly for game logic
- node.js + ws for multiplayer
- vanilla js frontend
- room-based matchmaking
