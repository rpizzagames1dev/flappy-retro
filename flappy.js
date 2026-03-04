// flappy.js — Solo + Online Multiplayer (rooms) + Shop (pipe/bird skins)
// IMPORTANT: set MP_URL below.

// === MULTIPLAYER SERVER URL ===
// Local:  ws://localhost:8080
// Online: wss://YOUR-DOMAIN
const MP_URL = "ws://localhost:8080";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// overlays
const menuOverlay = document.getElementById("menuOverlay");
const shopOverlay = document.getElementById("shopOverlay");
const overOverlay = document.getElementById("overOverlay");

// menu buttons
const playSoloBtn = document.getElementById("playSoloBtn");
const shopBtn = document.getElementById("shopBtn");

// shop buttons
const backFromShopBtn = document.getElementById("backFromShopBtn");
const resetShopBtn = document.getElementById("resetShopBtn");

// over buttons
const restartBtn = document.getElementById("restartBtn");
const menuBtn = document.getElementById("menuBtn");

const assetWarn = document.getElementById("assetWarn");

// HUD
const scoreHud = document.getElementById("scoreHud");
const bestHud = document.getElementById("bestHud");
const bestTop = document.getElementById("bestTop");
const fpsTop = document.getElementById("fpsTop");
const scoreOver = document.getElementById("scoreOver");
const bestOver = document.getElementById("bestOver");
const coinsTop = document.getElementById("coinsTop");
const coinsShop = document.getElementById("coinsShop");
const shopList = document.getElementById("shopList");

// MP UI
const mpName = document.getElementById("mpName");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInp = document.getElementById("roomCodeInp");
const readyBtn = document.getElementById("readyBtn");
const mpStatus = document.getElementById("mpStatus");

// canvas constants
const W = canvas.width;
const H = canvas.height;
const FLOOR_H = 70;

// solo physics
const GRAVITY = 22.0;
const JUMP_VY  = -420.0;
const MAX_FALL = 900.0;

const PIPE_W = 80;
const PIPE_GAP = 190;
const PIPE_SPEED = 210.0;
const SPAWN_EVERY = 1.35;

const BIRD_DRAW = 54;
const BIRD_PAD  = 12;

// assets
const bgImg = new Image();
bgImg.src = "assets/bg_wide.png";
const birdImg = new Image();
birdImg.src = "assets/bird.png";

// local storage
const LS = {
  BEST: "flappyRetroBest",
  COINS: "flappyRetroCoins",
  OWNED: "flappyRetroOwned",
  EQUIP: "flappyRetroEquip",
};

function loadInt(key, def=0){
  const v = localStorage.getItem(key);
  const n = v ? parseInt(v, 10) : def;
  return Number.isFinite(n) ? n : def;
}
function saveInt(key, n){
  localStorage.setItem(key, String(n|0));
}
function loadJSON(key, def){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  }catch{
    return def;
  }
}
function saveJSON(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

// shop
let coins = loadInt(LS.COINS, 0);
let best = loadInt(LS.BEST, 0);

const SHOP_ITEMS = [
  { id:"pipe_classic", type:"pipe", name:"PIPES: CLASSIC", desc:"Default pipes", cost:0 },
  { id:"pipe_gold", type:"pipe", name:"PIPES: GOLD", desc:"Gold pipes", cost:120 },
  { id:"pipe_night", type:"pipe", name:"PIPES: NIGHT", desc:"Darker pipes", cost:80 },

  { id:"bird_classic", type:"bird", name:"BIRD: CLASSIC", desc:"Default bird", cost:0 },
  { id:"bird_red", type:"bird", name:"BIRD: RED", desc:"Red tint + outline", cost:60 },
  { id:"bird_cyan", type:"bird", name:"BIRD: CYAN", desc:"Cyan tint + outline", cost:60 },
  { id:"bird_gold", type:"bird", name:"BIRD: GOLD", desc:"Gold tint", cost:140 },
];

let owned = loadJSON(LS.OWNED, { pipe_classic:true, bird_classic:true });
let equipped = loadJSON(LS.EQUIP, { pipe:"pipe_classic", bird:"bird_classic" });

// game runtime (solo)
let running = false;
let paused = false;
let gameOver = false;

let score = 0;
let bird = null;
let pipes = [];
let spawnT = 0;
let bgX = 0;

// fps
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;

// ===== UI helpers =====
function syncUI(){
  scoreHud.textContent = String(score);
  bestHud.textContent = String(best);
  bestTop.textContent = String(best);
  scoreOver.textContent = String(score);
  bestOver.textContent = String(best);
  coinsTop.textContent = String(coins);
  coinsShop.textContent = String(coins);
}
function showOnly(which){
  // which: "menu" | "shop" | "over" | "none"
  menuOverlay.classList.toggle("hidden", which !== "menu");
  shopOverlay.classList.toggle("hidden", which !== "shop");
  overOverlay.classList.toggle("hidden", which !== "over");
}

// ===== SHOP =====
function rebuildShop(){
  shopList.innerHTML = "";

  const groups = [
    { label:"PIPE SKINS", type:"pipe" },
    { label:"BIRD SKINS", type:"bird" },
  ];

  for(const g of groups){
    const head = document.createElement("div");
    head.className = "shopItem";
    head.innerHTML = `<div class="shopName">${g.label}</div><div class="shopMeta muted">buy + equip</div>`;
    shopList.appendChild(head);

    for(const item of SHOP_ITEMS.filter(x => x.type === g.type)){
      const isOwned = !!owned[item.id];
      const isEquipped = (g.type === "pipe") ? (equipped.pipe === item.id) : (equipped.bird === item.id);

      const el = document.createElement("div");
      el.className = "shopItem";

      const top = document.createElement("div");
      top.className = "shopRow";
      top.innerHTML = `
        <div>
          <div class="shopName">${item.name}</div>
          <div class="shopMeta">${item.desc}</div>
        </div>
        <div class="shopMeta">${item.cost} COINS</div>
      `;
      el.appendChild(top);

      const bottom = document.createElement("div");
      bottom.className = "shopRow";

      const status = document.createElement("div");
      status.className = "shopMeta";
      status.textContent = isEquipped ? "EQUIPPED" : (isOwned ? "OWNED" : "LOCKED");
      bottom.appendChild(status);

      const btns = document.createElement("div");
      btns.className = "shopBtns";

      if(!isOwned){
        const buy = document.createElement("button");
        buy.className = "pxbtn";
        buy.textContent = "BUY";
        buy.onclick = () => {
          if(coins < item.cost) return;
          coins -= item.cost;
          owned[item.id] = true;
          saveInt(LS.COINS, coins);
          saveJSON(LS.OWNED, owned);
          syncUI();
          rebuildShop();
        };
        btns.appendChild(buy);
      }else{
        const equipBtn = document.createElement("button");
        equipBtn.className = "pxbtn";
        equipBtn.textContent = isEquipped ? "EQUIPPED" : "EQUIP";
        equipBtn.disabled = isEquipped;
        equipBtn.onclick = () => {
          if(g.type === "pipe") equipped.pipe = item.id;
          else equipped.bird = item.id;
          saveJSON(LS.EQUIP, equipped);
          rebuildShop();
        };
        btns.appendChild(equipBtn);
      }

      bottom.appendChild(btns);
      el.appendChild(bottom);
      shopList.appendChild(el);
    }
  }
}

// ===== VISUALS =====
function getPipeStyle(){
  let fill = "#33c948", shade = "#2aa83c", cap = "#39da51", edge = "#0b1b0e";
  if(equipped.pipe === "pipe_gold"){ fill="#f6d34b"; shade="#caa62f"; cap="#ffe27a"; edge="#1a1406"; }
  if(equipped.pipe === "pipe_night"){ fill="#2bd26a"; shade="#1f8f49"; cap="#35ff80"; edge="#07140b"; }
  return { fill, shade, cap, edge };
}
function getBirdSkin(){
  if(equipped.bird === "bird_red")  return { tint:"rgba(255,90,90,0.30)",  outline:"rgba(0,0,0,0.65)" };
  if(equipped.bird === "bird_cyan") return { tint:"rgba(90,255,240,0.28)", outline:"rgba(0,0,0,0.65)" };
  if(equipped.bird === "bird_gold") return { tint:"rgba(255,210,80,0.32)", outline:"rgba(0,0,0,0.65)" };
  return { tint:null, outline:"rgba(0,0,0,0.55)" };
}

const PIPE_LINE = 4;
const CAP_H = 26;
const CAP_OVERHANG = 8;
const SHADE_W = 12;

function drawPipeRect(x, y, w, h, st){
  ctx.fillStyle = st.fill;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = st.shade;
  ctx.fillRect(x + Math.floor(w * 0.62), y, SHADE_W, h);

  ctx.lineWidth = PIPE_LINE;
  ctx.strokeStyle = st.edge;
  ctx.strokeRect(x, y, w, h);
}

function drawPipeCap(x, y, w, h, st){
  const cx = x - CAP_OVERHANG;
  const cw = w + CAP_OVERHANG * 2;

  ctx.fillStyle = st.cap;
  ctx.fillRect(cx, y, cw, h);

  ctx.fillStyle = st.shade;
  ctx.fillRect(cx + Math.floor(cw * 0.62), y, SHADE_W, h);

  ctx.lineWidth = PIPE_LINE;
  ctx.strokeStyle = st.edge;
  ctx.strokeRect(cx, y, cw, h);

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(cx + PIPE_LINE, y + PIPE_LINE, cw - PIPE_LINE*2, 3);
}

function drawPipe(pipe){
  const st = getPipeStyle();
  const x = Math.round(pipe.x);

  const topH = Math.round(pipe.topH);
  if(topH > 0){
    const capH = Math.min(CAP_H, Math.max(10, topH));
    const capY = topH - capH;
    const bodyH = Math.max(0, capY);
    if(bodyH > 0) drawPipeRect(x, 0, PIPE_W, bodyH, st);
    drawPipeCap(x, capY, PIPE_W, capH, st);
  }

  const y2 = Math.round(pipe.bottomY);
  const h2 = Math.round((H - FLOOR_H) - pipe.bottomY);
  if(h2 > 0){
    const capH = Math.min(CAP_H, Math.max(10, h2));
    drawPipeCap(x, y2, PIPE_W, capH, st);
    const bodyY = y2 + capH;
    const bodyH = Math.max(0, (H - FLOOR_H) - bodyY);
    if(bodyH > 0) drawPipeRect(x, bodyY, PIPE_W, bodyH, st);
  }
}

function drawBirdSolo(){
  const skin = getBirdSkin();
  const cx = bird.x + BIRD_DRAW/2;
  const cy = bird.y + BIRD_DRAW/2;
  const tilt = Math.max(-0.45, Math.min(0.65, bird.vy / 650));

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // outline hack
  const o = 2;
  if(birdImg.complete && birdImg.naturalWidth > 0){
    ctx.drawImage(birdImg, -BIRD_DRAW/2 - o, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
    ctx.drawImage(birdImg, -BIRD_DRAW/2 + o, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
    ctx.drawImage(birdImg, -BIRD_DRAW/2, -BIRD_DRAW/2 - o, BIRD_DRAW, BIRD_DRAW);
    ctx.drawImage(birdImg, -BIRD_DRAW/2, -BIRD_DRAW/2 + o, BIRD_DRAW, BIRD_DRAW);
  }else{
    ctx.fillStyle = skin.outline;
    ctx.fillRect(-BIRD_DRAW/2 - o, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
  }

  // main
  if(birdImg.complete && birdImg.naturalWidth > 0){
    ctx.drawImage(birdImg, -BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
  }else{
    ctx.fillStyle = "#ffd08a";
    ctx.fillRect(-BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
  }

  if(skin.tint){
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = skin.tint;
    ctx.fillRect(-BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}

function drawFloor(){
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, H - FLOOR_H, W, FLOOR_H);
  ctx.fillStyle = "rgba(255,204,115,0.65)";
  ctx.fillRect(0, H - FLOOR_H, W, 3);
}

function drawBackground(dt, frozen=false){
  if(frozen) dt = 0;

  if(bgImg.complete && bgImg.naturalWidth > 0){
    bgX -= PIPE_SPEED * dt * 0.35;

    const iw = bgImg.naturalWidth;
    const ih = bgImg.naturalHeight;
    const scale = Math.max(W/iw, H/ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const oy = (H - dh) / 2;

    let x = bgX % dw;
    ctx.drawImage(bgImg, x, oy, dw, dh);
    ctx.drawImage(bgImg, x + dw, oy, dw, dh);
  }else{
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#0b0820");
    g.addColorStop(1, "#040410");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);
  }
}

// ===== SOLO GAME =====
function resetSolo(){
  score = 0;
  gameOver = false;
  bird = { x:110, y:H*0.48, vy:0 };
  pipes = [];
  spawnT = 0;
  bgX = 0;
  syncUI();
}

function startSolo(){
  running = true;
  paused = false;
  resetSolo();
  showOnly("none");
}

function endSolo(){
  running = false;
  gameOver = true;

  if(score > best){
    best = score;
    saveInt(LS.BEST, best);
  }
  syncUI();
  showOnly("over");
}

function spawnPipe(){
  const topMargin = 80;
  const bottomMargin = FLOOR_H + 80;
  const usable = H - topMargin - bottomMargin - PIPE_GAP;
  const topH = topMargin + Math.random()*usable;
  const bottomY = topH + PIPE_GAP;
  pipes.push({ x: W + 10, topH, bottomY, passed:false });
}

function rectsOverlap(a,b){
  return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
}
function birdHitbox(){
  const pad = BIRD_PAD;
  return { x: bird.x + pad, y: bird.y + pad, w: BIRD_DRAW - pad*2, h: BIRD_DRAW - pad*2 };
}
function pipeCollision(pipe){
  const hb = birdHitbox();
  const topRect = { x: pipe.x, y: 0, w: PIPE_W, h: pipe.topH };
  const botRect = { x: pipe.x, y: pipe.bottomY, w: PIPE_W, h: (H - FLOOR_H) - pipe.bottomY };
  return rectsOverlap(hb, topRect) || rectsOverlap(hb, botRect);
}
function jumpSolo(){
  if(!running || paused || gameOver) return;
  bird.vy = JUMP_VY;
}

// ===== ONLINE MULTIPLAYER =====
const mp = {
  ws: null,
  connected: false,
  inRoom: false,
  active: false,
  code: null,
  clientId: null,
  snap: null,
};

function mpSetStatus(s){
  if(mpStatus) mpStatus.textContent = s;
}

function mpSend(obj){
  if(mp.ws && mp.ws.readyState === WebSocket.OPEN){
    mp.ws.send(JSON.stringify(obj));
  }
}

function mpConnect(){
  if(mp.ws && (mp.ws.readyState === WebSocket.OPEN || mp.ws.readyState === WebSocket.CONNECTING)) return;

  mp.ws = new WebSocket(MP_URL);
  mpSetStatus("CONNECTING...");

  mp.ws.onopen = () => {
    mp.connected = true;
    mpSetStatus("CONNECTED");
  };

  mp.ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if(msg.t === "hello"){
      mp.clientId = msg.clientId;
      return;
    }

    if(msg.t === "roomCreated"){
      mp.inRoom = true;
      mp.code = msg.code;
      mp.snap = msg.snap;
      mpSetStatus(`ROOM ${mp.code} — share code, press READY`);
      return;
    }

    if(msg.t === "joined"){
      mp.inRoom = true;
      mp.code = msg.code;
      mp.snap = msg.snap;
      mpSetStatus(`JOINED ${mp.code} — press READY`);
      return;
    }

    if(msg.t === "lobby"){
      mp.snap = msg.snap;
      const n = msg.snap?.players?.length || 0;
      mpSetStatus(`LOBBY ${msg.snap.code} — players: ${n} — press READY`);
      return;
    }

    if(msg.t === "start"){
      mp.snap = msg.snap;
      mp.active = true;
      running = false;      // stop solo loop updates
      gameOver = false;
      showOnly("none");
      mpSetStatus(`STARTED ${mp.code}`);
      return;
    }

    if(msg.t === "state"){
      mp.snap = msg.snap;
      return;
    }

    if(msg.t === "gameOver"){
      mp.snap = msg.snap;
      mp.active = false;
      // show game over overlay
      score = mp.snap?.score ?? score;
      if(score > best){
        best = score;
        saveInt(LS.BEST, best);
      }
      syncUI();
      showOnly("over");
      mpSetStatus(`GAME OVER — room ${mp.code}`);
      return;
    }

    if(msg.t === "err"){
      mpSetStatus(`ERROR: ${msg.message}`);
      return;
    }
  };

  mp.ws.onclose = () => {
    mp.connected = false;
    mp.inRoom = false;
    mp.active = false;
    mpSetStatus("DISCONNECTED");
  };
}

// MP buttons
createRoomBtn?.addEventListener("click", ()=>{
  mpConnect();
  const name = (mpName?.value || "PLAYER").trim().slice(0,12);
  mpSend({ t:"createRoom", name });
});

joinRoomBtn?.addEventListener("click", ()=>{
  mpConnect();
  const name = (mpName?.value || "PLAYER").trim().slice(0,12);
  const code = (roomCodeInp?.value || "").trim().toUpperCase();
  mpSend({ t:"joinRoom", name, code });
});

readyBtn?.addEventListener("click", ()=>{
  if(!mp.connected || !mp.inRoom) return;
  mpSend({ t:"ready" });
  mpSetStatus(`READY — waiting... (${mp.code})`);
});

function mpJump(){
  if(!mp.active) return false;
  mpSend({ t:"jump" });
  return true;
}

// Draw MP snapshot
function drawMP(dt){
  const snap = mp.snap;
  if(!snap) return;

  // lock HUD to server score
  score = snap.score ?? score;
  scoreHud.textContent = String(score);

  // freeze bgX when MP (server moves pipes; bg is just cosmetic)
  drawBackground(dt, false);

  // draw pipes from server
  const serverPipes = snap.pipes || [];
  for(const p of serverPipes) drawPipe(p);

  // draw players from server
  const players = snap.players || [];
  for(const pl of players){
    // draw same bird sprite at pl.x/pl.y with their vy
    const skin = getBirdSkin();
    const cx = pl.x + BIRD_DRAW/2;
    const cy = pl.y + BIRD_DRAW/2;
    const tilt = Math.max(-0.45, Math.min(0.65, (pl.vy || 0) / 650));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    const o = 2;
    if(birdImg.complete && birdImg.naturalWidth > 0){
      ctx.drawImage(birdImg, -BIRD_DRAW/2 - o, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
      ctx.drawImage(birdImg, -BIRD_DRAW/2 + o, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
      ctx.drawImage(birdImg, -BIRD_DRAW/2, -BIRD_DRAW/2 - o, BIRD_DRAW, BIRD_DRAW);
      ctx.drawImage(birdImg, -BIRD_DRAW/2, -BIRD_DRAW/2 + o, BIRD_DRAW, BIRD_DRAW);
      ctx.drawImage(birdImg, -BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
    }else{
      ctx.fillStyle = "#ffd08a";
      ctx.fillRect(-BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
    }

    if(skin.tint){
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = skin.tint;
      ctx.fillRect(-BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
      ctx.globalCompositeOperation = "source-over";
    }

    // label marker (P1/P2/..)
    ctx.globalAlpha = 1;
    ctx.fillStyle = pl.alive ? "rgba(255,255,255,0.80)" : "rgba(255,80,80,0.80)";
    ctx.fillRect(-BIRD_DRAW/2, -BIRD_DRAW/2 - 8, 26, 6);

    ctx.restore();
  }

  drawFloor();
}

// ===== asset warn =====
let warned = false;
setTimeout(()=>{
  if(warned) return;
  const badBg = !(bgImg.complete && bgImg.naturalWidth > 0);
  const badBird = !(birdImg.complete && birdImg.naturalWidth > 0);
  if((badBg || badBird) && assetWarn){
    assetWarn.classList.remove("hidden");
    assetWarn.textContent =
      "Assets not found. Put files: assets/bg_wide.png and assets/bird.png (or fix names/paths).";
  }
  warned = true;
}, 700);

// ===== inputs =====
canvas.addEventListener("pointerdown", (e)=>{
  e.preventDefault();

  // if MP running -> send jump to server
  if(mpJump()) return;

  // solo: tap jumps only when game running and no overlays
  if(!menuOverlay.classList.contains("hidden")) return;
  if(!shopOverlay.classList.contains("hidden")) return;
  if(!overOverlay.classList.contains("hidden")) return;

  if(running) jumpSolo();
}, { passive:false });

document.addEventListener("keydown", (e)=>{
  if(e.code === "Space"){
    e.preventDefault();

    // MP active -> jump
    if(mpJump()) return;

    // menu shortcuts
    if(!menuOverlay.classList.contains("hidden")){
      startSolo();
      return;
    }
    if(!overOverlay.classList.contains("hidden")){
      startSolo();
      return;
    }
    if(running) jumpSolo();
  }
});

document.addEventListener("visibilitychange", ()=>{ paused = document.hidden; });

// ===== buttons =====
playSoloBtn.addEventListener("click", startSolo);
shopBtn.addEventListener("click", ()=>{
  rebuildShop();
  showOnly("shop");
  syncUI();
});

backFromShopBtn.addEventListener("click", ()=>{
  showOnly("menu");
  syncUI();
});

resetShopBtn.addEventListener("click", ()=>{
  coins = 0;
  owned = { pipe_classic:true, bird_classic:true };
  equipped = { pipe:"pipe_classic", bird:"bird_classic" };
  saveInt(LS.COINS, coins);
  saveJSON(LS.OWNED, owned);
  saveJSON(LS.EQUIP, equipped);
  syncUI();
  rebuildShop();
});

restartBtn.addEventListener("click", ()=>{
  // restart SOLO only; online restarts when host starts a new room (simple)
  startSolo();
});

menuBtn.addEventListener("click", ()=>{
  showOnly("menu");
  syncUI();
});

// ===== loop =====
function step(now){
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.033);

  fpsAcc += dt; fpsFrames++;
  if(fpsAcc >= 0.5){
    fpsTop.textContent = String(Math.round(fpsFrames / fpsAcc));
    fpsAcc = 0; fpsFrames = 0;
  }

  // DRAW + UPDATE
  ctx.clearRect(0,0,W,H);

  if(mp.active || mp.snap){
    // MP draw from server snapshot
    drawMP(dt);
    requestAnimationFrame(step);
    return;
  }

  // SOLO
  drawBackground(dt, false);

  if(running && !paused && !gameOver){
    bird.vy += GRAVITY * 60 * dt;
    bird.vy = Math.min(bird.vy, MAX_FALL);
    bird.y += bird.vy * dt;

    if(bird.y < 0){ bird.y = 0; bird.vy = 0; }

    if(bird.y + BIRD_DRAW >= H - FLOOR_H){
      bird.y = H - FLOOR_H - BIRD_DRAW;
      endSolo();
    }

    spawnT += dt;
    if(spawnT >= SPAWN_EVERY){
      spawnT -= SPAWN_EVERY;
      spawnPipe();
    }

    for(const p of pipes){
      p.x -= PIPE_SPEED * dt;
      if(!p.passed && p.x + PIPE_W < bird.x){
        p.passed = true;
        score++;
        coins += 1;
        saveInt(LS.COINS, coins);
        scoreHud.textContent = String(score);
        coinsTop.textContent = String(coins);
      }
    }
    pipes = pipes.filter(p => p.x + PIPE_W > -20);

    for(const p of pipes){
      if(pipeCollision(p)){
        endSolo();
        break;
      }
    }
  }

  for(const p of pipes) drawPipe(p);
  if(bird) drawBirdSolo();
  drawFloor();

  bestHud.textContent = String(best);
  bestTop.textContent = String(best);

  requestAnimationFrame(step);
}

// boot
syncUI();
showOnly("menu");
mpSetStatus("—");
requestAnimationFrame(step);