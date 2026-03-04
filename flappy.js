// flappy.js — Solo + Online MP + Shop w/ icons + Levels + Names over heads + Leaderboard
const MP_URL = "wss://flappy-retro.onrender.com";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;

const FLOOR_H = 70;
const PIPE_W = 80;

const BIRD_DRAW = 54;
const BIRD_PAD = 12;

// DOM
const menuOverlay = document.getElementById("menuOverlay");
const shopOverlay = document.getElementById("shopOverlay");
const overOverlay = document.getElementById("overOverlay");

const playSoloBtn = document.getElementById("playSoloBtn");
const shopBtn = document.getElementById("shopBtn");

const backFromShopBtn = document.getElementById("backFromShopBtn");
const resetShopBtn = document.getElementById("resetShopBtn");

const restartBtn = document.getElementById("restartBtn");
const menuBtn = document.getElementById("menuBtn");

const assetWarn = document.getElementById("assetWarn");

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

const levelSel = document.getElementById("levelSel");
const mpSkinSel = document.getElementById("mpSkinSel");
const mpPipeSel = document.getElementById("mpPipeSel");

const mpBoard = document.getElementById("mpBoard");
const mpBoardList = document.getElementById("mpBoardList");

// assets
const bgImg = new Image();
bgImg.src = "assets/bg_wide.png";

function makeImg(src){
  const img = new Image();
  img.src = src;
  return img;
}

const birdImgs = {
  bird_classic: makeImg("assets/bird.png"),
  bird_red: makeImg("assets/bird_red.png"),
  bird_cyan: makeImg("assets/bird_cyan.png"),
  bird_gold: makeImg("assets/bird_gold.png"),
};

// storage
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
function saveInt(key, n){ localStorage.setItem(key, String(n|0)); }

function loadJSON(key, def){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  }catch{
    return def;
  }
}
function saveJSON(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }

let coins = loadInt(LS.COINS, 0);
let best = loadInt(LS.BEST, 0);

// levels
const LEVELS = {
  classic: { id:"classic", name:"CLASSIC", gravity:22.0, jumpVy:-420.0, maxFall:900.0, gap:190, speed:210.0, spawnEvery:1.35 },
  hard:    { id:"hard",    name:"HARD",    gravity:25.0, jumpVy:-435.0, maxFall:950.0, gap:168, speed:235.0, spawnEvery:1.20 },
  zen:     { id:"zen",     name:"ZEN",     gravity:20.0, jumpVy:-405.0, maxFall:850.0, gap:210, speed:195.0, spawnEvery:1.50 },
};

function getSelectedLevelId(){
  const v = (levelSel?.value || "classic").toLowerCase();
  return LEVELS[v] ? v : "classic";
}
function getLevel(){ return LEVELS[getSelectedLevelId()]; }

// shop items
const SHOP_ITEMS = [
  { id:"pipe_classic", type:"pipe", name:"PIPES: CLASSIC", desc:"Default pipes", cost:0 },
  { id:"pipe_gold", type:"pipe", name:"PIPES: GOLD", desc:"Gold theme", cost:120 },
  { id:"pipe_night", type:"pipe", name:"PIPES: NIGHT", desc:"Dark theme", cost:80 },

  { id:"bird_classic", type:"bird", name:"BIRD: CLASSIC", desc:"assets/bird.png", cost:0 },
  { id:"bird_red", type:"bird", name:"BIRD: RED", desc:"assets/bird_red.png", cost:60 },
  { id:"bird_cyan", type:"bird", name:"BIRD: CYAN", desc:"assets/bird_cyan.png", cost:60 },
  { id:"bird_gold", type:"bird", name:"BIRD: GOLD", desc:"assets/bird_gold.png", cost:140 },
];

let owned = loadJSON(LS.OWNED, { pipe_classic:true, bird_classic:true });
let equipped = loadJSON(LS.EQUIP, { pipe:"pipe_classic", bird:"bird_classic" });

// UI helpers
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
  menuOverlay.classList.toggle("hidden", which !== "menu");
  shopOverlay.classList.toggle("hidden", which !== "shop");
  overOverlay.classList.toggle("hidden", which !== "over");
}
function mpSetStatus(s){ if(mpStatus) mpStatus.textContent = s; }

// ===== shop icon helpers =====
function birdIconSrc(id){
  if(id === "bird_classic") return "assets/bird.png";
  if(id === "bird_red") return "assets/bird_red.png";
  if(id === "bird_cyan") return "assets/bird_cyan.png";
  if(id === "bird_gold") return "assets/bird_gold.png";
  return "assets/bird.png";
}

function rebuildShop(){
  shopList.innerHTML = "";

  for(const item of SHOP_ITEMS){
    const isOwned = !!owned[item.id];
    const isEquipped = (item.type === "pipe") ? (equipped.pipe === item.id) : (equipped.bird === item.id);

    const el = document.createElement("div");
    el.className = "shopItem";

    const top = document.createElement("div");
    top.className = "shopRow";

    let iconHTML = "";
    if(item.type === "bird"){
      iconHTML = `<img class="shopIcon" src="${birdIconSrc(item.id)}" alt="">`;
    }else{
      iconHTML = `<div class="pipeIcon ${item.id}"></div>`;
    }

    top.innerHTML = `
      <div class="shopLeft">
        ${iconHTML}
        <div>
          <div class="shopName">${item.name}</div>
          <div class="shopMeta">${item.desc}</div>
        </div>
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

        // auto-equip if it's a bird and you want
        syncUI();
        rebuildShop();
        refreshSkinSelect(); // keep MP dropdown in sync
      };
      btns.appendChild(buy);
    }else{
      const equipBtn = document.createElement("button");
      equipBtn.className = "pxbtn";
      equipBtn.textContent = isEquipped ? "EQUIPPED" : "EQUIP";
      equipBtn.disabled = isEquipped;
      equipBtn.onclick = () => {
        if(item.type === "pipe") equipped.pipe = item.id;
        else equipped.bird = item.id;

        saveJSON(LS.EQUIP, equipped);
        refreshSkinSelect();

        // if MP and in room, send live skin update
        if(item.type === "bird" && mp.connected && mp.inRoom){
          mpSend({ t:"setSkin", birdSkin: equipped.bird });
        }
        rebuildShop();
      };
      btns.appendChild(equipBtn);
    }

    bottom.appendChild(btns);
    el.appendChild(bottom);
    shopList.appendChild(el);
  }
}

// only show owned skins in dropdown, and block selecting unowned
function refreshSkinSelect(){
  if(!mpSkinSel) return;
  const cur = equipped.bird || "bird_classic";

  mpSkinSel.innerHTML = "";
  const birds = SHOP_ITEMS.filter(i => i.type === "bird");

  for(const it of birds){
    if(!owned[it.id]) continue;
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name;
    mpSkinSel.appendChild(opt);
  }

  if(owned[cur]) mpSkinSel.value = cur;
  else mpSkinSel.value = "bird_classic";
}

// ===== visuals =====
function getPipeStyle(pipeSkin){
  const id = pipeSkin || equipped.pipe || "pipe_classic";
  let fill = "#33c948", shade = "#2aa83c", cap = "#39da51", edge = "#0b1b0e";
  if(id === "pipe_gold"){ fill="#f6d34b"; shade="#caa62f"; cap="#ffe27a"; edge="#1a1406"; }
  if(id === "pipe_night"){ fill="#2bd26a"; shade="#1f8f49"; cap="#35ff80"; edge="#07140b"; }
  return { fill, shade, cap, edge };
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

function drawPipe(pipe, pipeSkin){
  const st = getPipeStyle(pipeSkin);
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

function drawFloor(){
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, H - FLOOR_H, W, FLOOR_H);
  ctx.fillStyle = "rgba(255,204,115,0.65)";
  ctx.fillRect(0, H - FLOOR_H, W, 3);
}

let bgX = 0;
function drawBackground(dt, speed){
  if(bgImg.complete && bgImg.naturalWidth > 0){
    bgX -= speed * dt * 0.35;

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

function drawBirdAt(x, y, vy, birdSkin){
  const img = birdImgs[birdSkin] || birdImgs.bird_classic;
  const cx = x + BIRD_DRAW/2;
  const cy = y + BIRD_DRAW/2;
  const tilt = Math.max(-0.45, Math.min(0.65, (vy || 0) / 650));

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  if(img && img.complete && img.naturalWidth > 0){
    ctx.drawImage(img, -BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
  }else{
    // fallback square (means missing asset)
    ctx.fillStyle = "#ffd08a";
    ctx.fillRect(-BIRD_DRAW/2, -BIRD_DRAW/2, BIRD_DRAW, BIRD_DRAW);
  }

  ctx.restore();
}

function drawNameTag(x, y, name){
  const label = (name || "PLAYER").slice(0, 14);

  ctx.save();
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const tx = x + BIRD_DRAW/2;
  const ty = y - 6;

  const w = ctx.measureText(label).width + 14;
  const h = 18;
  const rx = tx - w/2;
  const ry = ty - h;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(rx, ry, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, ry, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(label, tx, ty - 3);

  ctx.restore();
}

function rectsOverlap(a,b){
  return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y);
}

// ===== SOLO =====
let running = false;
let paused = false;
let gameOver = false;

let score = 0;
let bird = null;
let pipes = [];
let spawnT = 0;

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

function spawnPipeSolo(level){
  const PIPE_GAP = level.gap;

  const topMargin = 80;
  const bottomMargin = FLOOR_H + 80;
  const usable = H - topMargin - bottomMargin - PIPE_GAP;
  const topH = topMargin + Math.random()*usable;
  const bottomY = topH + PIPE_GAP;
  pipes.push({ x: W + 10, topH, bottomY, passed:false });
}

function birdHitboxSolo(){
  const pad = BIRD_PAD;
  return { x: bird.x + pad, y: bird.y + pad, w: BIRD_DRAW - pad*2, h: BIRD_DRAW - pad*2 };
}

function pipeCollisionSolo(pipe){
  const hb = birdHitboxSolo();
  const topRect = { x: pipe.x, y: 0, w: PIPE_W, h: pipe.topH };
  const botRect = { x: pipe.x, y: pipe.bottomY, w: PIPE_W, h: (H - FLOOR_H) - pipe.bottomY };
  return rectsOverlap(hb, topRect) || rectsOverlap(hb, botRect);
}

function jumpSolo(level){
  if(!running || paused || gameOver) return;
  bird.vy = level.jumpVy;
}

// ===== MULTIPLAYER =====
const mp = {
  ws: null,
  connected: false,
  inRoom: false,
  active: false,
  code: null,
  clientId: null,
  snap: null,
};

function mpSend(obj){
  if(mp.ws && mp.ws.readyState === WebSocket.OPEN){
    mp.ws.send(JSON.stringify(obj));
  }
}

function isHostSnap(snap){
  return snap && mp.clientId && snap.hostId === mp.clientId;
}

function setMpButtonsDisabled(v){
  createRoomBtn.disabled = v;
  joinRoomBtn.disabled = v;
  readyBtn.disabled = v;
}

function renderMpBoard(snap){
  const visible = !!(snap && (mp.inRoom || mp.active) && (snap.players && snap.players.length));
  mpBoard.classList.toggle("hidden", !visible);

  if(!visible){
    mpBoardList.innerHTML = "";
    return;
  }

  const players = [...snap.players].sort((a,b)=>{
    const aa = a.alive ? 1 : 0;
    const bb = b.alive ? 1 : 0;
    if(aa !== bb) return bb - aa;
    return (b.score|0) - (a.score|0);
  });

  mpBoardList.innerHTML = "";
  for(const p of players){
    const row = document.createElement("div");
    row.className = "mpLine" + (p.alive ? "" : " dead");

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = (p.id === snap.hostId ? "★ " : "") + (p.name || "PLAYER");

    const pts = document.createElement("div");
    pts.className = "pts";
    pts.textContent = String(p.score ?? 0);

    row.appendChild(who);
    row.appendChild(pts);
    mpBoardList.appendChild(row);
  }
}

function applySnapToSelectors(snap){
  if(!snap) return;
  const host = isHostSnap(snap);

  // level / pipes controlled by host in MP
  levelSel.value = snap.levelId || getSelectedLevelId();
  levelSel.disabled = (mp.inRoom && !host);

  mpPipeSel.value = snap.pipeSkin || "pipe_classic";
  mpPipeSel.disabled = (mp.inRoom && !host);

  // skin select stays local but if server reports my skin, sync it
  const me = (snap.players || []).find(p => p.id === mp.clientId);
  if(me?.birdSkin && owned[me.birdSkin]){
    equipped.bird = me.birdSkin;
    saveJSON(LS.EQUIP, equipped);
    refreshSkinSelect();
  }
}

function mpConnect(){
  if(mp.ws && (mp.ws.readyState === WebSocket.OPEN || mp.ws.readyState === WebSocket.CONNECTING)) return;

  setMpButtonsDisabled(true);
  mpSetStatus("CONNECTING... (waking server)");

  let opened = false;
  mp.ws = new WebSocket(MP_URL);

  const hardTimeout = setTimeout(() => {
    if(opened) return;
    mpSetStatus("STILL WAKING... retrying once");
    try { mp.ws.close(); } catch {}
    mp.ws = new WebSocket(MP_URL);
    mp.ws.onopen = onOpen;
    mp.ws.onmessage = onMsg;
    mp.ws.onclose = onClose;
  }, 7000);

  function onOpen(){
    opened = true;
    clearTimeout(hardTimeout);
    mp.connected = true;
    mpSetStatus("CONNECTED");
    setMpButtonsDisabled(false);
  }

  function onClose(){
    clearTimeout(hardTimeout);
    mp.connected = false;
    mp.inRoom = false;
    mp.active = false;
    mp.snap = null;
    mpSetStatus("DISCONNECTED");
    setMpButtonsDisabled(false);
    renderMpBoard(null);
  }

  function onMsg(ev){
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
      mpSetStatus(`ROOM ${mp.code} — READY`);
      // set name + skin right away
      const nm = (mpName.value || "PLAYER").trim().slice(0,14);
      mpSend({ t:"setName", name: nm });
      mpSend({ t:"setSkin", birdSkin: equipped.bird });
      mpSend({ t:"setPipeSkin", pipeSkin: equipped.pipe });
      mpSend({ t:"setLevel", levelId: getSelectedLevelId() });

      renderMpBoard(mp.snap);
      return;
    }

    if(msg.t === "joined"){
      mp.inRoom = true;
      mp.code = msg.code;
      mp.snap = msg.snap;
      mpSetStatus(`JOINED ${mp.code} — READY`);
      const nm = (mpName.value || "PLAYER").trim().slice(0,14);
      mpSend({ t:"setName", name: nm });
      mpSend({ t:"setSkin", birdSkin: equipped.bird });

      renderMpBoard(mp.snap);
      return;
    }

    if(msg.t === "lobby"){
      mp.snap = msg.snap;
      applySnapToSelectors(mp.snap);
      mpSetStatus(`LOBBY ${mp.snap.code} — players: ${(mp.snap.players||[]).length}`);
      renderMpBoard(mp.snap);
      return;
    }

    if(msg.t === "start"){
      mp.snap = msg.snap;
      mp.active = true;
      running = false;
      gameOver = false;
      showOnly("none");
      applySnapToSelectors(mp.snap);
      mpSetStatus(`STARTED ${mp.code}`);
      renderMpBoard(mp.snap);
      return;
    }

    if(msg.t === "state"){
      mp.snap = msg.snap;
      renderMpBoard(mp.snap);
      return;
    }

    if(msg.t === "gameOver"){
      mp.snap = msg.snap;
      mp.active = false;

      score = mp.snap?.score ?? score;
      if(score > best){
        best = score;
        saveInt(LS.BEST, best);
      }
      syncUI();
      showOnly("over");
      mpSetStatus(`GAME OVER — ${mp.code}`);
      renderMpBoard(mp.snap);
      return;
    }

    if(msg.t === "err"){
      mpSetStatus(`ERROR: ${msg.message}`);
      return;
    }
  }

  mp.ws.onopen = onOpen;
  mp.ws.onmessage = onMsg;
  mp.ws.onclose = onClose;
}

function mpJump(){
  if(!mp.active) return false;
  mpSend({ t:"jump" });
  return true;
}

// ===== events =====
createRoomBtn.addEventListener("click", ()=>{
  mpConnect();
  const nm = (mpName.value || "PLAYER").trim().slice(0,14);
  mpSend({ t:"createRoom", name: nm });
});

joinRoomBtn.addEventListener("click", ()=>{
  mpConnect();
  const nm = (mpName.value || "PLAYER").trim().slice(0,14);
  const code = (roomCodeInp.value || "").trim().toUpperCase();
  mpSend({ t:"joinRoom", name: nm, code });
});

readyBtn.addEventListener("click", ()=>{
  if(!mp.connected || !mp.inRoom) return;
  mpSend({ t:"ready" });
  mpSetStatus(`READY — waiting... (${mp.code})`);
});

mpName.addEventListener("change", ()=>{
  const nm = (mpName.value || "PLAYER").trim().slice(0,14);
  if(mp.connected && mp.inRoom) mpSend({ t:"setName", name: nm });
});

mpSkinSel.addEventListener("change", ()=>{
  const v = mpSkinSel.value || "bird_classic";

  if(!owned[v]){
    mpSetStatus("LOCKED SKIN — buy it in SHOP");
    refreshSkinSelect(); // revert
    return;
  }

  equipped.bird = v;
  saveJSON(LS.EQUIP, equipped);

  if(mp.connected && mp.inRoom) mpSend({ t:"setSkin", birdSkin: v });
});

levelSel.addEventListener("change", ()=>{
  // SOLO: affects physics immediately (next start)
  // MP: server will accept only from host
  if(mp.connected && mp.inRoom){
    mpSend({ t:"setLevel", levelId: getSelectedLevelId() });
  }
});

mpPipeSel.addEventListener("change", ()=>{
  if(!owned[mpPipeSel.value]){
    mpSetStatus("LOCKED PIPES — buy it in SHOP");
    mpPipeSel.value = equipped.pipe;
    return;
  }
  equipped.pipe = mpPipeSel.value;
  saveJSON(LS.EQUIP, equipped);

  if(mp.connected && mp.inRoom){
    mpSend({ t:"setPipeSkin", pipeSkin: mpPipeSel.value });
  }
});

// inputs
canvas.addEventListener("pointerdown", (e)=>{
  e.preventDefault();

  if(mpJump()) return;

  if(!menuOverlay.classList.contains("hidden")) return;
  if(!shopOverlay.classList.contains("hidden")) return;
  if(!overOverlay.classList.contains("hidden")) return;

  if(running) jumpSolo(getLevel());
}, { passive:false });

document.addEventListener("keydown", (e)=>{
  if(e.code === "Space"){
    e.preventDefault();

    if(mpJump()) return;

    if(!menuOverlay.classList.contains("hidden")){
      startSolo();
      return;
    }
    if(!overOverlay.classList.contains("hidden")){
      startSolo();
      return;
    }
    if(running) jumpSolo(getLevel());
  }
});

document.addEventListener("visibilitychange", ()=>{ paused = document.hidden; });

// menu buttons
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
  refreshSkinSelect();
  syncUI();
  rebuildShop();
});

restartBtn.addEventListener("click", startSolo);
menuBtn.addEventListener("click", ()=>{
  showOnly("menu");
  syncUI();
});

// asset warning
setTimeout(()=>{
  const badBg = !(bgImg.complete && bgImg.naturalWidth > 0);
  const classic = birdImgs.bird_classic;
  const badBird = !(classic.complete && classic.naturalWidth > 0);
  if((badBg || badBird) && assetWarn){
    assetWarn.classList.remove("hidden");
    assetWarn.textContent = "Missing assets. Required: assets/bg_wide.png and assets/bird.png (plus optional skins).";
  }
}, 700);

// ===== main loop =====
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;

function step(now){
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.033);

  fpsAcc += dt; fpsFrames++;
  if(fpsAcc >= 0.5){
    fpsTop.textContent = String(Math.round(fpsFrames / fpsAcc));
    fpsAcc = 0; fpsFrames = 0;
  }

  ctx.clearRect(0,0,W,H);

  // MP render
  if(mp.snap && (mp.inRoom || mp.active)){
    const snap = mp.snap;
    const level = LEVELS[snap.levelId || "classic"] || LEVELS.classic;

    drawBackground(dt, level.speed);

    const pipeSkin = snap.pipeSkin || "pipe_classic";
    for(const p of (snap.pipes || [])) drawPipe(p, pipeSkin);

    for(const pl of (snap.players || [])){
      drawBirdAt(pl.x, pl.y, pl.vy, pl.birdSkin || "bird_classic");
      drawNameTag(pl.x, pl.y, pl.name || "PLAYER");
    }

    drawFloor();

    score = snap.score ?? score;
    scoreHud.textContent = String(score);

    requestAnimationFrame(step);
    return;
  }

  // SOLO update + render
  const level = getLevel();
  drawBackground(dt, level.speed);

  if(running && !paused && !gameOver){
    bird.vy += level.gravity * 60 * dt;
    bird.vy = Math.min(bird.vy, level.maxFall);
    bird.y += bird.vy * dt;

    if(bird.y < 0){ bird.y = 0; bird.vy = 0; }

    if(bird.y + BIRD_DRAW >= H - FLOOR_H){
      bird.y = H - FLOOR_H - BIRD_DRAW;
      endSolo();
    }

    spawnT += dt;
    if(spawnT >= level.spawnEvery){
      spawnT -= level.spawnEvery;
      spawnPipeSolo(level);
    }

    for(const p of pipes){
      p.x -= level.speed * dt;
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
      if(pipeCollisionSolo(p)){
        endSolo();
        break;
      }
    }
  }

  for(const p of pipes) drawPipe(p, equipped.pipe);
  if(bird) drawBirdAt(bird.x, bird.y, bird.vy, equipped.bird);
  drawFloor();

  bestHud.textContent = String(best);
  bestTop.textContent = String(best);

  requestAnimationFrame(step);
}

// boot
syncUI();
showOnly("menu");
mpSetStatus("—");
refreshSkinSelect();
if(mpPipeSel) mpPipeSel.value = equipped.pipe;
if(levelSel) levelSel.value = "classic";
rebuildShop();
requestAnimationFrame(step);