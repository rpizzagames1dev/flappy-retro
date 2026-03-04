import http from "http";
import WebSocket, { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Flappy Retro MP server OK");
});

const wss = new WebSocketServer({ server });

const MAX_PLAYERS = 8;

const W = 420, H = 720;
const FLOOR_H = 70;
const PIPE_W = 80;
const BIRD_DRAW = 54;
const BIRD_PAD = 12;

const LEVELS = {
  classic: { gravity:22.0, jumpVy:-420.0, maxFall:900.0, gap:190, speed:210.0, spawnEvery:1.35 },
  hard:    { gravity:25.0, jumpVy:-435.0, maxFall:950.0, gap:168, speed:235.0, spawnEvery:1.20 },
  zen:     { gravity:20.0, jumpVy:-405.0, maxFall:850.0, gap:210, speed:195.0, spawnEvery:1.50 },
};

const ALLOWED_BIRDS = new Set(["bird_classic","bird_red","bird_cyan","bird_gold"]);
const ALLOWED_PIPES = new Set(["pipe_classic","pipe_gold","pipe_night"]);

function code4(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for(let i=0;i<4;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

const rooms = new Map();
let nextClientId = 1;

function rectsOverlap(a,b){
  return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
}
function birdHitbox(p){
  return { x: p.x + BIRD_PAD, y: p.y + BIRD_PAD, w: BIRD_DRAW - BIRD_PAD*2, h: BIRD_DRAW - BIRD_PAD*2 };
}
function pipeCollision(player, pipe){
  const hb = birdHitbox(player);
  const topRect = { x: pipe.x, y: 0, w: PIPE_W, h: pipe.topH };
  const botRect = { x: pipe.x, y: pipe.bottomY, w: PIPE_W, h: (H - FLOOR_H) - pipe.bottomY };
  return rectsOverlap(hb, topRect) || rectsOverlap(hb, botRect);
}

function makeRoom(hostId){
  let code = code4();
  while(rooms.has(code)) code = code4();
  const room = {
    code,
    hostId,
    started:false,
    gameOver:false,
    levelId:"classic",
    pipeSkin:"pipe_classic",
    score:0,
    pipes:[],
    spawnT:0,
    players:new Map(),
    tickTimer:null,
    stateTimer:null,
  };
  rooms.set(code, room);
  return room;
}

function snapshot(room){
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    gameOver: room.gameOver,
    levelId: room.levelId,
    pipeSkin: room.pipeSkin,
    score: room.score,
    pipes: room.pipes,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      x: p.x, y: p.y, vy: p.vy,
      alive: p.alive,
      ready: p.ready,
      score: p.score,
      birdSkin: p.birdSkin || "bird_classic",
    }))
  };
}

function send(ws, obj){
  if(ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj){
  const msg = JSON.stringify(obj);
  for(const p of room.players.values()){
    if(p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

function spawnPipe(room, level){
  const topMargin = 80;
  const bottomMargin = FLOOR_H + 80;
  const usable = H - topMargin - bottomMargin - level.gap;
  const topH = topMargin + Math.random()*usable;
  const bottomY = topH + level.gap;
  room.pipes.push({ x: W + 10, topH, bottomY });
}

function startGame(room){
  room.started = true;
  room.gameOver = false;
  room.score = 0;
  room.pipes = [];
  room.spawnT = 0;

  for(const p of room.players.values()){
    p.x = 110;
    p.y = H * 0.48;
    p.vy = 0;
    p.alive = true;
    p.score = 0;
    p.nextPipeIndex = 0;
    p.ready = false;
  }

  const TICK_HZ = 30;
  const DT = 1 / TICK_HZ;
  const STATE_HZ = 8;

  if(room.tickTimer) clearInterval(room.tickTimer);
  if(room.stateTimer) clearInterval(room.stateTimer);

  room.tickTimer = setInterval(()=>{
    if(!room.started || room.gameOver) return;
    const lv = LEVELS[room.levelId] || LEVELS.classic;

    room.spawnT += DT;
    if(room.spawnT >= lv.spawnEvery){
      room.spawnT -= lv.spawnEvery;
      spawnPipe(room, lv);
    }

    for(const pipe of room.pipes) pipe.x -= lv.speed * DT;
    room.pipes = room.pipes.filter(p => p.x + PIPE_W > -20);

    for(const pl of room.players.values()){
      if(!pl.alive) continue;

      pl.vy += lv.gravity * 60 * DT;
      if(pl.vy > lv.maxFall) pl.vy = lv.maxFall;
      pl.y += pl.vy * DT;

      if(pl.y < 0){ pl.y = 0; pl.vy = 0; }

      if(pl.y + BIRD_DRAW >= H - FLOOR_H){
        pl.y = H - FLOOR_H - BIRD_DRAW;
        pl.alive = false;
      }

      for(const pipe of room.pipes){
        if(pipeCollision(pl, pipe)){
          pl.alive = false;
          break;
        }
      }

      while(pl.nextPipeIndex < room.pipes.length){
        const pipe = room.pipes[pl.nextPipeIndex];
        if(pipe.x + PIPE_W < pl.x){
          pl.score += 1;
          pl.nextPipeIndex += 1;
          room.score = Math.max(room.score, pl.score);
        }else break;
      }
    }

    const anyAlive = Array.from(room.players.values()).some(p => p.alive);
    if(!anyAlive){
      room.gameOver = true;
      room.started = false;
      broadcast(room, { t:"gameOver", snap: snapshot(room) });
    }
  }, 1000 / TICK_HZ);

  room.stateTimer = setInterval(()=>{
    broadcast(room, { t:"state", snap: snapshot(room) });
  }, 1000 / STATE_HZ);

  broadcast(room, { t:"start", snap: snapshot(room) });
}

function tryAutoStart(room){
  if(room.players.size < 1) return;
  const allReady = Array.from(room.players.values()).every(p => p.ready);
  if(allReady) startGame(room);
}

wss.on("connection", (ws)=>{
  const clientId = String(nextClientId++);
  let room = null;

  send(ws, { t:"hello", clientId });

  ws.on("message", (buf)=>{
    let msg;
    try{ msg = JSON.parse(buf.toString()); } catch { return; }

    if(msg.t === "createRoom"){
      if(room) return;
      const r = makeRoom(clientId);
      const name = String(msg.name || "PLAYER").slice(0,14);

      r.players.set(clientId, {
        id: clientId, ws, name,
        ready:false, alive:true,
        x:110, y:H*0.48, vy:0,
        score:0, nextPipeIndex:0,
        birdSkin:"bird_classic"
      });

      room = r;

      send(ws, { t:"roomCreated", code: r.code, snap: snapshot(r) });
      broadcast(r, { t:"lobby", snap: snapshot(r) });
      return;
    }

    if(msg.t === "joinRoom"){
      if(room) return;
      const code = String(msg.code || "").toUpperCase();
      const r = rooms.get(code);
      if(!r) return send(ws, { t:"err", message:"ROOM_NOT_FOUND" });
      if(r.players.size >= MAX_PLAYERS) return send(ws, { t:"err", message:"ROOM_FULL" });
      if(r.started) return send(ws, { t:"err", message:"IN_PROGRESS" });

      const name = String(msg.name || "PLAYER").slice(0,14);
      r.players.set(clientId, {
        id: clientId, ws, name,
        ready:false, alive:true,
        x:110, y:H*0.48, vy:0,
        score:0, nextPipeIndex:0,
        birdSkin:"bird_classic"
      });

      room = r;

      send(ws, { t:"joined", code: r.code, snap: snapshot(r) });
      broadcast(r, { t:"lobby", snap: snapshot(r) });
      return;
    }

    if(!room) return send(ws, { t:"err", message:"NOT_IN_ROOM" });

    const me = room.players.get(clientId);
    if(!me) return;

    if(msg.t === "ready"){
      me.ready = true;
      broadcast(room, { t:"lobby", snap: snapshot(room) });
      tryAutoStart(room);
      return;
    }

    if(msg.t === "setName"){
      me.name = String(msg.name || me.name).slice(0,14);
      broadcast(room, { t:"lobby", snap: snapshot(room) });
      return;
    }

    // ✅ kompatybilny setSkin: obsłuży birdSkin (nowe) i skin/id (starsze)
    if(msg.t === "setSkin"){
      const incoming = msg.birdSkin ?? msg.skin ?? msg.id;
      const skin = String(incoming || me.birdSkin || "bird_classic");
      me.birdSkin = ALLOWED_BIRDS.has(skin) ? skin : "bird_classic";
      broadcast(room, { t:"lobby", snap: snapshot(room) });
      return;
    }

    if(msg.t === "setLevel"){
      if(room.hostId !== clientId) return;
      const id = String(msg.levelId || "classic").toLowerCase();
      if(!LEVELS[id]) return;
      room.levelId = id;
      broadcast(room, { t:"lobby", snap: snapshot(room) });
      return;
    }

    if(msg.t === "setPipeSkin"){
      if(room.hostId !== clientId) return;
      const ps = String(msg.pipeSkin || room.pipeSkin);
      room.pipeSkin = ALLOWED_PIPES.has(ps) ? ps : "pipe_classic";
      broadcast(room, { t:"lobby", snap: snapshot(room) });
      return;
    }

    if(msg.t === "jump"){
      if(!room.started || room.gameOver || !me.alive) return;
      const lv = LEVELS[room.levelId] || LEVELS.classic;
      me.vy = lv.jumpVy;
      return;
    }
  });

  ws.on("close", ()=>{
    if(!room) return;
    room.players.delete(clientId);

    if(room.hostId === clientId){
      room.hostId = room.players.keys().next().value || null;
    }

    broadcast(room, { t:"lobby", snap: snapshot(room) });

    if(room.players.size === 0){
      if(room.tickTimer) clearInterval(room.tickTimer);
      if(room.stateTimer) clearInterval(room.stateTimer);
      rooms.delete(room.code);
    }
  });
});

server.listen(PORT, ()=>{
  console.log("MP server listening on :" + PORT);
});