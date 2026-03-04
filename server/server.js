import http from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

// Game constants
const W = 420, H = 720;
const FLOOR_H = 70;

const GRAVITY = 22.0;
const JUMP_VY = -420.0;
const MAX_FALL = 900.0;

const PIPE_W = 80;
const PIPE_GAP = 190;
const PIPE_SPEED = 210.0;
const SPAWN_EVERY = 1.35;

const BIRD_DRAW = 54;
const BIRD_PAD = 12;

function codeRoom() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function rectsOverlap(a, b){
  return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
}
function birdHitbox(pl){
  const pad = BIRD_PAD;
  return { x: pl.x + pad, y: pl.y + pad, w: BIRD_DRAW - pad*2, h: BIRD_DRAW - pad*2 };
}
function pipeCollision(pl, pipe){
  const hb = birdHitbox(pl);
  const topRect = { x: pipe.x, y: 0, w: PIPE_W, h: pipe.topH };
  const botRect = { x: pipe.x, y: pipe.bottomY, w: PIPE_W, h: (H - FLOOR_H) - pipe.bottomY };
  return rectsOverlap(hb, topRect) || rectsOverlap(hb, botRect);
}
function spawnPipe(pipes){
  const topMargin = 80;
  const bottomMargin = FLOOR_H + 80;
  const usable = H - topMargin - bottomMargin - PIPE_GAP;
  const topH = topMargin + Math.random() * usable;
  const bottomY = topH + PIPE_GAP;
  pipes.push({ x: W + 10, topH, bottomY, passed:false });
}

const rooms = new Map();
let nextClientId = 1;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Flappy Retro MP server OK\n");
});
const wss = new WebSocketServer({ server });

function send(ws, msg){
  if(ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg){
  for(const pl of room.players.values()){
    if(pl.ws && pl.ws.readyState === pl.ws.OPEN){
      pl.ws.send(JSON.stringify(msg));
    }
  }
}

function makeRoom(){
  let code;
  do { code = codeRoom(); } while(rooms.has(code));
  const room = {
    code,
    running: false,
    tick: 0,
    spawnT: 0,
    pipes: [],
    score: 0,
    players: new Map(), // clientId -> player
  };
  rooms.set(code, room);
  return room;
}

function resetRoomGame(room){
  room.running = true;
  room.tick = 0;
  room.spawnT = 0;
  room.pipes = [];
  room.score = 0;

  const xs = [110, 155, 200, 245];
  let i = 0;
  for(const pl of room.players.values()){
    pl.x = xs[i % xs.length];
    pl.y = H * (0.45 + 0.04*i);
    pl.vy = 0;
    pl.alive = true;
    pl.ready = false;
    i++;
  }
}

function roomSnapshot(room){
  return {
    code: room.code,
    running: room.running,
    tick: room.tick,
    score: room.score,
    pipes: room.pipes,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      x: p.x, y: p.y, vy: p.vy,
      alive: p.alive
    }))
  };
}

const TICK_HZ = 20;
const DT = 1 / TICK_HZ;

setInterval(() => {
  for(const room of rooms.values()){
    if(!room.running) continue;

    // physics
    for(const pl of room.players.values()){
      if(!pl.alive) continue;

      pl.vy += GRAVITY * 60 * DT;
      pl.vy = Math.min(pl.vy, MAX_FALL);
      pl.y += pl.vy * DT;

      if(pl.y < 0){ pl.y = 0; pl.vy = 0; }

      if(pl.y + BIRD_DRAW >= H - FLOOR_H){
        pl.y = H - FLOOR_H - BIRD_DRAW;
        pl.alive = false;
      }
    }

    // pipes
    room.spawnT += DT;
    if(room.spawnT >= SPAWN_EVERY){
      room.spawnT -= SPAWN_EVERY;
      spawnPipe(room.pipes);
    }

    for(const pipe of room.pipes){
      pipe.x -= PIPE_SPEED * DT;
    }
    room.pipes = room.pipes.filter(p => p.x + PIPE_W > -30);

    // score
    const alivePlayers = Array.from(room.players.values()).filter(p=>p.alive);
    const refX = alivePlayers.length ? Math.min(...alivePlayers.map(p=>p.x)) : 110;
    for(const pipe of room.pipes){
      if(!pipe.passed && pipe.x + PIPE_W < refX){
        pipe.passed = true;
        room.score += 1;
      }
    }

    // collisions
    for(const pipe of room.pipes){
      for(const pl of room.players.values()){
        if(pl.alive && pipeCollision(pl, pipe)){
          pl.alive = false;
        }
      }
    }

    // end
    const anyAlive = Array.from(room.players.values()).some(p=>p.alive);
    if(!anyAlive && room.players.size > 0){
      room.running = false;
      broadcast(room, { t:"gameOver", snap: roomSnapshot(room) });
      continue;
    }

    room.tick++;
    broadcast(room, { t:"state", snap: roomSnapshot(room) });
  }
}, 1000 / TICK_HZ);

wss.on("connection", (ws) => {
  const clientId = String(nextClientId++);
  ws._id = clientId;
  ws._room = null;

  send(ws, { t:"hello", clientId });

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    if(msg.t === "createRoom"){
      const room = makeRoom();
      const name = (msg.name || "PLAYER").toString().slice(0, 12);
      room.players.set(clientId, { id: clientId, name, ws, x:110,y:H*0.48,vy:0,alive:true,ready:false });
      ws._room = room.code;

      send(ws, { t:"roomCreated", code: room.code, snap: roomSnapshot(room) });
      broadcast(room, { t:"lobby", snap: roomSnapshot(room) });
      return;
    }

    if(msg.t === "joinRoom"){
      const code = (msg.code || "").toString().trim().toUpperCase();
      const room = rooms.get(code);
      if(!room) { send(ws, { t:"err", message:"ROOM_NOT_FOUND" }); return; }
      if(room.players.size >= 4){ send(ws, { t:"err", message:"ROOM_FULL" }); return; }

      const name = (msg.name || "PLAYER").toString().slice(0, 12);
      room.players.set(clientId, { id: clientId, name, ws, x:110,y:H*0.48,vy:0,alive:true,ready:false });
      ws._room = room.code;

      send(ws, { t:"joined", code: room.code, snap: roomSnapshot(room) });
      broadcast(room, { t:"lobby", snap: roomSnapshot(room) });
      return;
    }

    if(msg.t === "ready"){
      const room = rooms.get(ws._room);
      if(!room) return;
      const pl = room.players.get(clientId);
      if(!pl) return;

      pl.ready = true;
      broadcast(room, { t:"lobby", snap: roomSnapshot(room) });

      const players = Array.from(room.players.values());
      const allReady = players.length >= 2 && players.every(p=>p.ready);
      if(allReady && !room.running){
        resetRoomGame(room);
        broadcast(room, { t:"start", snap: roomSnapshot(room) });
      }
      return;
    }

    if(msg.t === "jump"){
      const room = rooms.get(ws._room);
      if(!room || !room.running) return;
      const pl = room.players.get(clientId);
      if(!pl || !pl.alive) return;
      pl.vy = JUMP_VY;
      return;
    }
  });

  ws.on("close", () => {
    const code = ws._room;
    if(!code) return;
    const room = rooms.get(code);
    if(!room) return;

    room.players.delete(clientId);
    if(room.players.size === 0){
      rooms.delete(code);
      return;
    }

    broadcast(room, { t:"lobby", snap: roomSnapshot(room) });
  });
});

server.listen(PORT, () => {
  console.log(`MP server listening on :${PORT}`);
});