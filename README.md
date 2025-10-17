# quantum chess

multiplayer chess with quantum mechanics and mutual uncertainty

## features

- symmetric fog of war - both players see their pieces classically, opponent pieces in superposition
- probing mechanic - move to ghost square to collapse wave function
- forced reveals on capture or check
- game history stored in SQLite
- docker-ready for cloud deployment

## project structure

```
/
  apps/
    server/
      src/
        index.ts     # WebSocket server
        db.ts        # SQLite game history
    web/
      src/
        main.ts      # Game UI
        wasm-types.ts
      public/
        index.html   # Game page
  packages/
    chess/
      src/
        main.zig
        chess.zig
        quantum.zig
      build.zig
  dist/              # Build outputs (gitignored)
    wasm/
      quantum-chess.wasm
    web/
      app.js
  Dockerfile
  docker-compose.yaml
```

## local development

### prerequisites

- [Bun](https://bun.sh) >= 1.3.0
- [Zig](https://ziglang.org) >= 0.13.0

### setup

```bash
# install dependencies
bun install

# build wasm + client
bun run build

# start development server
bun run dev
```

open http://localhost:8080

## production deployment

### docker compose (recommended)

```bash
# build and run
docker-compose up -d

# view logs
docker-compose logs -f

# stop
docker-compose down
```

### docker manual

```bash
# build image
docker build -t quantum-chess .

# run container
docker run -d \
  -p 8080:8080 \
  -v quantum-chess-data:/app/data \
  --name quantum-chess \
  quantum-chess

# view logs
docker logs -f quantum-chess
```

### environment variables

- `DATABASE_PATH` - SQLite database location (default: `quantum-chess.db`)
- `NODE_ENV` - Environment mode (default: `production`)

## cloud deployment

### railway

```bash
# install railway cli
npm install -g @railway/cli

# login
railway login

# create project
railway init

# deploy
railway up
```

### render

1. connect github repo
2. select "Docker" as runtime
3. expose port 8080
4. add persistent disk at `/app/data`
5. deploy

### fly.io

```bash
# install flyctl
curl -L https://fly.io/install.sh | sh

# create app
fly launch

# deploy
fly deploy
```

## database

game history stored in SQLite:

- `games` - room code, players, start/end time, winner
- `moves` - all moves with timestamps, captures, checks

query recent games:

```bash
sqlite3 quantum-chess.db "SELECT * FROM games ORDER BY started_at DESC LIMIT 10"
```

## build commands

```bash
bun run build:wasm      # build zig wasm only
bun run build:client    # build typescript client only
bun run build           # build both
bun run start           # start production server
bun run dev             # start development server with watch
```

## game rules

see in-game rules button for full quantum chess mechanics
