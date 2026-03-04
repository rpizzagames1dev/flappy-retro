// server.js — Flappy Retro MP (rooms, levels, skins, names, leaderboard)
// Run: npm start
// Render uses process.env.PORT

const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  // simple health check
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Flappy Retro MP server OK");
});

const wss = new WebSocket.Server({ server });

// ====== CONFIG ======
const MAX_PLAYERS = 8;
const TICK_HZ = 30;           // simulation tick
const STATE_HZ = 15;          // state broadcast rate (lower = less lag)
const DT = 1 / TICK_HZ;

const W = 420;
const H = 720;
const FLOOR_H = 70;

const PIPE_W = 80;

// Levels shared across room
const LEVELS = {
  classic: { id: "classic", name: "CLASSIC", gravity: 22.0, jumpVy: -420.0, maxFall: 900.0, gap: 190, speed: 210.0, spawnEvery: 1.35 },
  hard:    { id: "hard",    name: "HARD",    gravity: 25.0, jumpVy: -435.0, maxFall: 950.0, gap: 168, speed: 235.0, spawnEvery: 1.20 },
  zen:     { id: "zen",     name: "ZEN",     gravity: 20.0, jumpVy: -405.0, maxFall: 850.0, gap: 210, speed: 195.0, spawnEvery: 1.50 },
};

// skins are just IDs; client decides visuals
const DEFAULT_BIRD_SKIN = "bird_classic";
const DEFAULT_PIPE_SKIN = "pipe_classic";

// ====== ROOM STATE ======
const rooms = new Map(); // code -> room

function code4() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function makeRoom(hostClientId) {
  let code = code4();
  while (rooms.has(code)) code = code4();

  const room = {
    code,
    hostClientId,
    levelId: "classic",
    started: false,
    gameOver: false,

    score: 0,
    pipes: [],
    spawnT: 0,
    bgX: 0,

    // clientId -> player
    players: new Map(),

    // timing
    tickTimer: null,
    stateTimer: null,
  };

  rooms.set(code, room);
  return room;
}

function getSnap(room) {
  const players = Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    vy: p.vy,
    alive: p.alive,
    ready: p.ready,
    score: p.score,
    birdSkin: p.birdSkin,
    // show pipes skin in UI too
  }));

  return {
    code: room.code,
    hostId: room.hostClientId,
    started: room.started,
    gameOver: room.gameOver,
    score: room.score,
    levelId: room.levelId,
    pipeSkin: room.pipeSkin || DEFAULT_PIPE_SKIN,
    pipes: room.pipes,
    players,
  };
}

function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

function roomCleanupIfEmpty(room) {
  if (room.players.size === 0) {
    if (room.tickTimer) clearInterval(room.tickTimer);
    if (room.stateTimer) clearInterval(room.stateTimer);
    rooms.delete(room.code);
  }
}

function spawnPipe(room, level) {
  const PIPE_GAP = level.gap;

  const topMargin = 80;
  const bottomMargin = FLOOR_H + 80;
  const usable = H - topMargin - bottomMargin - PIPE_GAP;
  const topH = topMargin + Math.random() * usable;
  const bottomY = topH + PIPE_GAP;

  room.pipes.push({ x: W + 10, topH, bottomY, passed: false });
}

function rectsOverlap(a, b) {
  return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
}

function birdHitbox(p) {
  // match client: BIRD_DRAW=54, pad=12
  const pad = 12;
  const draw = 54;
  return { x: p.x + pad, y: p.y + pad, w: draw - pad * 2, h: draw - pad * 2 };
}

function pipeCollision(room, player, pipe) {
  const hb = birdHitbox(player);
  const topRect = { x: pipe.x, y: 0, w: PIPE_W, h: pipe.topH };
  const botRect = { x: pipe.x, y: pipe.bottomY, w: PIPE_W, h: (H - FLOOR_H) - pipe.bottomY };
  return rectsOverlap(hb, topRect) || rectsOverlap(hb, botRect);
}

function startRoom(room) {
  const level = LEVELS[room.levelId] || LEVELS.classic;

  room.started = true;
  room.gameOver = false;
  room.score = 0;
  room.pipes = [];
  room.spawnT = 0;
  room.bgX = 0;

  // reset all players
  for (const p of room.players.values()) {
    p.x = 110;
    p.y = H * 0.48;
    p.vy = 0;
    p.alive = true;
    p.score = 0;
  }

  // tick loop
  if (room.tickTimer) clearInterval(room.tickTimer);
  room.tickTimer = setInterval(() => {
    if (!room.started || room.gameOver) return;

    // spawn pipes
    room.spawnT += DT;
    if (room.spawnT >= level.spawnEvery) {
      room.spawnT -= level.spawnEvery;
      spawnPipe(room, level);
    }

    // move pipes
    for (const pipe of room.pipes) {
      pipe.x -= level.speed * DT;
    }
    room.pipes = room.pipes.filter(p => p.x + PIPE_W > -20);

    // physics and scoring
    for (const pl of room.players.values()) {
      if (!pl.alive) continue;

      // gravity
      pl.vy += level.gravity * 60 * DT;
      if (pl.vy > level.maxFall) pl.vy = level.maxFall;
      pl.y += pl.vy * DT;

      // top barrier
      if (pl.y < 0) {
        pl.y = 0;
        pl.vy = 0;
      }

      // floor
      if (pl.y + 54 >= H - FLOOR_H) {
        pl.y = H - FLOOR_H - 54;
        pl.alive = false;
      }

      // collisions + pass
      for (const pipe of room.pipes) {
        if (pipeCollision(room, pl, pipe)) {
          pl.alive = false;
          break;
        }
        if (!pipe.passed && pipe.x + PIPE_W < pl.x) {
          // This "passed" is global in solo; in MP we score per player:
          // keep pipe.passed as a global marker is wrong, so do per player.
        }
      }

      // per-player scoring: track nextPassIndex
      if (pl.nextPipeIndex == null) pl.nextPipeIndex = 0;
      // increment while pipes behind
      while (pl.nextPipeIndex < room.pipes.length) {
        const pipe = room.pipes[pl.nextPipeIndex];
        if (pipe.x + PIPE_W < pl.x) {
          pl.score += 1;
          // room score = max player score (simple shared score)
          room.score = Math.max(room.score, pl.score);
          pl.nextPipeIndex += 1;
        } else break;
      }
    }

    // check end condition: everyone dead
    const anyAlive = Array.from(room.players.values()).some(p => p.alive);
    if (!anyAlive) {
      room.gameOver = true;
      room.started = false;
      broadcast(room, { t: "gameOver", snap: getSnap(room) });
    }
  }, 1000 / TICK_HZ);

  // state broadcast loop
  if (room.stateTimer) clearInterval(room.stateTimer);
  room.stateTimer = setInterval(() => {
    const snap = getSnap(room);
    broadcast(room, { t: "state", snap });
  }, 1000 / STATE_HZ);

  broadcast(room, { t: "start", snap: getSnap(room) });
}

function tryAutoStart(room) {
  // start if all players ready and at least 2? you can set >=1
  if (room.players.size < 1) return;
  const allReady = Array.from(room.players.values()).every(p => p.ready);
  if (!allReady) return;
  startRoom(room);
}

// ====== CONNECTIONS ======
let nextClientId = 1;

wss.on("connection", (ws) => {
  const clientId = String(nextClientId++);
  let currentRoom = null;

  ws.send(JSON.stringify({ t: "hello", clientId }));

  function err(message) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "err", message }));
  }

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (msg.t === "createRoom") {
      if (currentRoom) return err("Already in a room.");
      const name = String(msg.name || "PLAYER").slice(0, 14);

      const room = makeRoom(clientId);
      room.pipeSkin = DEFAULT_PIPE_SKIN;

      const player = {
        id: clientId,
        ws,
        name,
        ready: false,
        alive: true,
        x: 110,
        y: H * 0.48,
        vy: 0,
        score: 0,
        nextPipeIndex: 0,
        birdSkin: DEFAULT_BIRD_SKIN,
      };

      room.players.set(clientId, player);
      currentRoom = room;

      ws.send(JSON.stringify({ t: "roomCreated", code: room.code, snap: getSnap(room) }));
      broadcast(room, { t: "lobby", snap: getSnap(room) });
      return;
    }

    if (msg.t === "joinRoom") {
      if (currentRoom) return err("Already in a room.");
      const code = String(msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return err("Room not found.");
      if (room.players.size >= MAX_PLAYERS) return err("Room is full.");
      if (room.started) return err("Game already started. Wait for next round.");

      const name = String(msg.name || "PLAYER").slice(0, 14);

      const player = {
        id: clientId,
        ws,
        name,
        ready: false,
        alive: true,
        x: 110,
        y: H * 0.48,
        vy: 0,
        score: 0,
        nextPipeIndex: 0,
        birdSkin: DEFAULT_BIRD_SKIN,
      };

      room.players.set(clientId, player);
      currentRoom = room;

      ws.send(JSON.stringify({ t: "joined", code: room.code, snap: getSnap(room) }));
      broadcast(room, { t: "lobby", snap: getSnap(room) });
      return;
    }

    if (!currentRoom) return err("Not in a room.");
    const room = currentRoom;

    if (msg.t === "ready") {
      const p = room.players.get(clientId);
      if (!p) return;
      p.ready = true;
      broadcast(room, { t: "lobby", snap: getSnap(room) });
      tryAutoStart(room);
      return;
    }

    if (msg.t === "setName") {
      const p = room.players.get(clientId);
      if (!p) return;
      p.name = String(msg.name || p.name).slice(0, 14);
      broadcast(room, { t: "lobby", snap: getSnap(room) });
      return;
    }

    if (msg.t === "setSkin") {
      const p = room.players.get(clientId);
      if (!p) return;
      // allow change anytime (even midgame)
      p.birdSkin = String(msg.birdSkin || p.birdSkin);
      broadcast(room, { t: room.started ? "state" : "lobby", snap: getSnap(room) });
      return;
    }

    if (msg.t === "setPipeSkin") {
      // host controls pipe skin
      if (room.hostClientId !== clientId) return err("Only host can change pipe skin.");
      room.pipeSkin = String(msg.pipeSkin || room.pipeSkin);
      broadcast(room, { t: "lobby", snap: getSnap(room) });
      return;
    }

    if (msg.t === "setLevel") {
      if (room.hostClientId !== clientId) return err("Only host can change level.");
      const levelId = String(msg.levelId || "").toLowerCase();
      if (!LEVELS[levelId]) return err("Unknown level.");
      room.levelId = levelId;
      broadcast(room, { t: "lobby", snap: getSnap(room) });
      return;
    }

    if (msg.t === "jump") {
      const p = room.players.get(clientId);
      if (!p || !room.started || room.gameOver || !p.alive) return;
      const level = LEVELS[room.levelId] || LEVELS.classic;
      p.vy = level.jumpVy;
      return;
    }
  });

  ws.on("close", () => {
    if (currentRoom) {
      const room = currentRoom;
      room.players.delete(clientId);

      // if host left, assign new host
      if (room.hostClientId === clientId) {
        const next = room.players.keys().next().value;
        room.hostClientId = next || null;
      }

      broadcast(room, { t: "lobby", snap: getSnap(room) });
      roomCleanupIfEmpty(room);
      currentRoom = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`MP server listening on :${PORT}`);
});