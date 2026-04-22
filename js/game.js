const socket = io(); // This connects the browser to your server.js

// Listen for other players
socket.on('currentPlayers', (players) => {
    console.log("Active players in arena:", players);
    // Here you would loop through 'players' and draw them to your canvas
});

// Example: When your snake moves, tell the server
function sendPositionToServer(x, y) {
    socket.emit('playerMovement', { x: x, y: y });
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const grid = 20;

let gameState = 'MENU';
let countdown = 3;
let binding = null;
let canTurn = true;

// --- MOBILE & FOCUS DETECTION ---
// Force true if you want to see them on MacBook for layout testing
let isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// --- NETWORK STATE ---
let peer = null;
let conn = null;
let isHost = false;
let isOnline = false; 
let clients = []; 

const keyMap = {
    8: "BACK", 13: "ENT", 16: "SHFT", 32: "SPC",
    37: "←", 38: "↑", 39: "→", 40: "↓", 
    65: "A", 68: "D", 83: "S", 87: "W",
    73: "I", 74: "J", 75: "K", 76: "L",
    100: "N4", 101: "N5", 102: "N6", 104: "N8"
};

const playerDefs = [
    { name: "P1", color: "#00d2ff", x: 40,  y: 40,  dx: grid, dy: 0 },
    { name: "P2", color: "#9d50bb", x: 740, y: 440, dx: -grid, dy: 0 },
    { name: "P3", color: "#3fb950", x: 740, y: 40,  dx: 0, dy: grid },
    { name: "P4", color: "#d29922", x: 40,  y: 440, dx: 0, dy: -grid }
];

let activeConfigs = [];
let players = [];
let apple = { x: 400, y: 240, type: 'normal' };
let myPlayerIdx = 0; 

function resize() { canvas.width = 800; canvas.height = 500; }
window.addEventListener('resize', resize);
resize();

// --- TOUCH CONTROL SETUP ---
function setupMobileControls() {
    // If you want to force these on your MacBook to see them, comment out the next line:
    if (!isTouchDevice) return; 
    
    if (document.getElementById('mobile-interface')) return;

    const touchOverlay = document.createElement('div');
    touchOverlay.id = 'mobile-interface';
    touchOverlay.innerHTML = `
        <div class="d-pad">
            <button class="ctrl-btn up" id="btn-u">▲</button>
            <div class="ctrl-row">
                <button class="ctrl-btn left" id="btn-l">◀</button>
                <button class="ctrl-btn down" id="btn-d">▼</button>
                <button class="ctrl-btn right" id="btn-r">▶</button>
            </div>
        </div>
        <div class="action-buttons">
            <button class="ctrl-btn pause-btn" id="btn-pause">II</button>
        </div>
    `;
    document.body.appendChild(touchOverlay);

    // This links the visual button to your actual keybinds in the config
    const bindTouch = (id, keyIndex) => {
        const el = document.getElementById(id);
        
        // Function to handle the input
        const triggerInput = (e) => {
            e.preventDefault();
            if (document.hidden || (gameState !== 'PLAYING' && gameState !== 'STARTING')) return;

            // Grab the ACTUAL keycode from your current binds (Up=0, Down=1, Left=2, Right=3)
            const currentKey = activeConfigs[myPlayerIdx].keys[keyIndex];
            
            handleDirectionChange(myPlayerIdx, currentKey);

            if (isOnline && !isHost && conn && conn.open) {
                conn.send({ type: 'INPUT', key: currentKey });
            }
        };

        el.addEventListener('touchstart', triggerInput, { passive: false });
        // Optional: Adding mousedown so you can click them with a mouse on your Mac to test
        el.addEventListener('mousedown', triggerInput);
    };

    bindTouch('btn-u', 0); // Links to whatever key is in the "Up" slot
    bindTouch('btn-d', 1); // Down
    bindTouch('btn-l', 2); // Left
    bindTouch('btn-r', 3); // Right

    const pBtn = document.getElementById('btn-pause');
    const pauseLogic = (e) => { e.preventDefault(); togglePause(); };
    pBtn.addEventListener('touchstart', pauseLogic);
    pBtn.addEventListener('mousedown', pauseLogic);
}

// --- P2P NETWORKING ---
document.getElementById('host-btn').onclick = () => {
    const pass = document.getElementById('room-input').value;
    if(!pass) return alert("Please enter a password to host.");
    peer = new Peer('snake-os-' + pass);
    peer.on('open', () => {
        isHost = true;
        isOnline = true;
        document.getElementById('lobby-footer').innerText = "LIVE | PASSWORD: " + pass;
        document.getElementById('status-msg').innerText = "HOSTING ONLINE SESSION";
        renderMenu();
    });
    peer.on('connection', (c) => {
        clients.push(c);
        addPlayer(); 
        c.on('open', () => {
            c.send({ type: 'LOBBY_SYNC', configs: activeConfigs, yourIdx: clients.indexOf(c) + 1 });
        });
        c.on('data', (data) => {
            if (data.type === 'INPUT' && isHost) {
                const pIdx = clients.indexOf(c) + 1;
                handleDirectionChange(pIdx, data.key);
            }
            if (data.type === 'UPDATE_CONFIG' && isHost) {
                activeConfigs[data.idx][data.key] = data.value;
                renderMenu();
                broadcast({ type: 'LOBBY_SYNC', configs: activeConfigs });
            }
        });
    });
};

document.getElementById('join-btn').onclick = () => {
    const pass = document.getElementById('room-input').value;
    if(!pass) return alert("Enter the host's password.");
    peer = new Peer();
    peer.on('open', () => {
        conn = peer.connect('snake-os-' + pass);
        conn.on('open', () => {
            isOnline = true;
            document.getElementById('status-msg').innerText = "CONNECTED TO HOST";
            document.getElementById('lobby-footer').innerText = "JOINED | PASSWORD: " + pass;
        });
        conn.on('data', (data) => {
            if (data.type === 'LOBBY_SYNC') { 
                activeConfigs = data.configs;
                if (data.yourIdx !== undefined) myPlayerIdx = data.yourIdx;
                renderMenu(); 
            }
            if (data.type === 'GAME_STATE') { 
                players = data.players; 
                apple = data.apple; 
                countdown = data.countdown; 
                if (data.state === 'PLAYING' && gameState === 'STARTING') {
                    gameState = 'PLAYING';
                    update();
                }
                if (data.state === 'MENU' && players.length > 0) {
                    showPostGameMenu(null, true); 
                }
            }
            if (data.type === 'START') { startLocalGame(data.mode); }
        });
    });
};

function broadcast(data) {
    if (isHost) clients.forEach(c => { if (c.open) c.send(data); });
}

// --- CORE MENU & PLAYER LOGIC ---
function startBinding(playerIdx, keyIdx) {
    const canEditThisSlot = !isOnline || isHost || (playerIdx === myPlayerIdx);
    if (!canEditThisSlot) return;
    binding = { pIdx: playerIdx, kIdx: keyIdx };
    renderMenu();
}

function updatePlayerConfig(idx, key, value) {
    activeConfigs[idx][key] = value;
    renderMenu();
    if (isHost) broadcast({ type: 'LOBBY_SYNC', configs: activeConfigs });
    else if (isOnline && conn && conn.open) conn.send({ type: 'UPDATE_CONFIG', idx: idx, key: key, value: value });
}

function addPlayer() {
    if (activeConfigs.length >= 4) return;
    const i = activeConfigs.length;
    const localKeyPresets = [[87, 83, 65, 68], [38, 40, 37, 39], [73, 75, 74, 76], [104, 101, 100, 102]];
    const defaultKeys = isOnline ? [38, 40, 37, 39] : localKeyPresets[i];

    activeConfigs.push({ 
        ...playerDefs[i], 
        keys: defaultKeys,
        cells: [], maxCells: 5, name: `PLAYER ${i+1}`
    });
    renderMenu();
    if (isHost) broadcast({ type: 'LOBBY_SYNC', configs: activeConfigs });
}

function removePlayer(idx) {
    if (activeConfigs.length <= 1) return;
    activeConfigs.splice(idx, 1);
    renderMenu();
    if (isHost) broadcast({ type: 'LOBBY_SYNC', configs: activeConfigs });
}

function renderMenu() {
    const container = document.getElementById('player-slots');
    if (!container) return;
    let menuHTML = activeConfigs.map((p, i) => {
        const canEditThisSlot = !isOnline || isHost || (i === myPlayerIdx);
        const getKeyLabel = (kIdx) => (binding && binding.pIdx === i && binding.kIdx === kIdx) ? "..." : (keyMap[p.keys[kIdx]] || "?");
        return `
        <div class="player-config" style="${i === myPlayerIdx ? 'border: 1px solid var(--neon-blue);' : ''}">
            ${(isHost && activeConfigs.length > 1) ? `<button class="remove-btn" onclick="removePlayer(${i})">×</button>` : ''}
            <span style="font-size:10px; color:var(--neon-blue); font-weight:bold;">PLAYER ${i+1} ${i === myPlayerIdx ? '(YOU)' : ''}</span>
            <input type="text" onchange="updatePlayerConfig(${i}, 'name', this.value)" value="${p.name}" class="name-input" ${!canEditThisSlot ? 'readonly' : ''}>
            <input type="color" onchange="updatePlayerConfig(${i}, 'color', this.value)" value="${p.color}" class="color-picker" ${!canEditThisSlot ? 'disabled' : ''} style="width:40px; height:40px; cursor:pointer; background:none; border:none; filter: drop-shadow(0 0 5px ${p.color});">
            <div class="key-grid">
                <button style="grid-area: u" onclick="startBinding(${i}, 0)">${getKeyLabel(0)}</button>
                <button style="grid-area: l" onclick="startBinding(${i}, 2)">${getKeyLabel(2)}</button>
                <button style="grid-area: d" onclick="startBinding(${i}, 1)">${getKeyLabel(1)}</button>
                <button style="grid-area: r" onclick="startBinding(${i}, 3)">${getKeyLabel(3)}</button>
            </div>
        </div>`;
    }).join('');
    if ((!isOnline || isHost) && activeConfigs.length < 4) menuHTML += `<div class="add-player-btn" onclick="addPlayer()"><span>+</span><p>ADD PLAYER</p></div>`;
    container.innerHTML = menuHTML;
}

// --- GAMEPLAY LOOP ---
window.addEventListener('keydown', e => {
    if (document.hidden) return;

    if (binding !== null) {
        e.preventDefault();
        const newKeys = [...activeConfigs[binding.pIdx].keys];
        newKeys[binding.kIdx] = e.keyCode;
        updatePlayerConfig(binding.pIdx, 'keys', newKeys);
        binding = null;
        return;
    }
    if (e.keyCode === 27) { togglePause(); return; }
    if (gameState !== 'PLAYING') return;
    
    if (isOnline && !isHost && conn && conn.open) {
        conn.send({ type: 'INPUT', key: e.keyCode });
    } else {
        activeConfigs.forEach((config, i) => {
            const [u, d, l, r] = config.keys;
            if ([u, d, l, r].includes(e.keyCode)) handleDirectionChange(i, e.keyCode);
        });
    }
});

function handleDirectionChange(pIdx, keyCode) {
    const p = players[pIdx];
    if (!p || p.isDead) return;
    const [u, d, l, r] = activeConfigs[pIdx].keys;
    if (keyCode === l && p.dx === 0) { p.dx = -grid; p.dy = 0; }
    else if (keyCode === u && p.dy === 0) { p.dy = -grid; p.dx = 0; }
    else if (keyCode === r && p.dx === 0) { p.dx = grid; p.dy = 0; }
    else if (keyCode === d && p.dy === 0) { p.dy = grid; p.dx = 0; }
}

function update() {
    if (gameState === 'MENU' || (gameState === 'PAUSED' && !isOnline)) return;

    setTimeout(() => {
        if (gameState === 'MENU') return;
        requestAnimationFrame(update);
        const mode = document.getElementById('game-mode').value;

        if (!isOnline || isHost) {
            if (gameState === 'PLAYING') {
                Mods.applyRules(players, mode);
                players.forEach((p, i) => {
                    if (p.isDead) return;
                    if (mode === 'hvsh' && Mods.headstart > 0 && p.role === 'hunter') return;
                    p.x += p.dx; p.y += p.dy;
                    if (p.x < 0) p.x = canvas.width - grid; 
                    else if (p.x >= canvas.width) p.x = 0;
                    if (p.y < 0) p.y = canvas.height - grid; 
                    else if (p.y >= canvas.height) p.y = 0;
                    p.cells.unshift({x: p.x, y: p.y});
                    if (p.cells.length > p.maxCells && mode !== 'wall') p.cells.pop();
                    if (p.x === apple.x && p.y === apple.y) { 
                        p.maxCells++; 
                        spawnApple(); 
                    }
                });
                const col = Mods.checkCollision(players, mode);
                if (col) { showPostGameMenu(col.winner); return; }
            }
            if (isHost) broadcast({ type: 'GAME_STATE', players, apple, countdown, state: gameState });
        }

        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        players.forEach((p, i) => {
            if (p.isDead) return;
            ctx.fillStyle = p.color;
            p.cells.forEach(c => ctx.fillRect(c.x, c.y, grid-1, grid-1));
        });
        ctx.fillStyle = "#ff3131"; 
        ctx.beginPath(); ctx.arc(apple.x + 10, apple.y + 10, 8, 0, Math.PI*2); ctx.fill();
        Mods.drawUI(ctx, canvas, players, mode);

        if (gameState === 'STARTING') {
            ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.fillStyle = "white"; ctx.font = "bold 80px Segoe UI"; ctx.textAlign = "center";
            ctx.fillText(countdown, canvas.width/2, canvas.height/2 + 30);
        }
    }, 100);
}

function spawnApple() {
    apple.x = Math.floor(Math.random() * (canvas.width/grid)) * grid;
    apple.y = Math.floor(Math.random() * (canvas.height/grid)) * grid;
}

document.getElementById('start-btn').onclick = () => {
    if (isOnline && !isHost) return alert("Only the host can start!");
    const mode = document.getElementById('game-mode').value;
    if (isHost) broadcast({ type: 'START', mode: mode });
    startLocalGame(mode);
};

function startLocalGame(mode) {
    document.getElementById('post-game-menu').style.display = 'none';
    document.getElementById('pause-trigger').style.display = 'block';
    players = activeConfigs.map(c => ({ 
        ...c, cells: [{x: c.x, y: c.y}], maxCells: 5, dx: c.dx, dy: c.dy
    }));
    const modeName = Mods.initMode(mode, players);
    document.getElementById('status-msg').innerText = modeName;
    gameState = 'STARTING';
    document.getElementById('main-menu').style.display = 'none';
    countdown = 3;
    let timer = setInterval(() => {
        countdown--;
        if (countdown <= 0) { 
            clearInterval(timer); gameState = 'PLAYING'; update(); 
        }
    }, 1000);
}

function togglePause() {
    if (gameState !== 'PLAYING' && gameState !== 'PAUSED') return;
    const pauseMenu = document.getElementById('pause-menu');
    if (isOnline) {
        pauseMenu.style.display = (pauseMenu.style.display === 'none') ? 'flex' : 'none';
    } else {
        if (gameState === 'PLAYING') {
            gameState = 'PAUSED';
            pauseMenu.style.display = 'flex';
            document.getElementById('status-msg').innerText = "SYSTEM PAUSED";
        } else {
            gameState = 'PLAYING';
            pauseMenu.style.display = 'none';
            document.getElementById('status-msg').innerText = "PLAYING";
            update(); 
        }
    }
}

function showPostGameMenu(winnerName, isRemote = false) {
    gameState = 'MENU';
    document.getElementById('pause-trigger').style.display = 'none';
    const postMenu = document.getElementById('post-game-menu');
    if (winnerName) document.getElementById('winner-text').innerText = winnerName.toUpperCase() + " WINS!";
    postMenu.style.display = 'flex';
    const playBtn = document.getElementById('play-again-btn');
    if (isOnline && !isHost) {
        playBtn.style.opacity = "0.5"; playBtn.innerText = "WAITING FOR HOST..."; playBtn.onclick = null;
    } else {
        playBtn.style.opacity = "1"; playBtn.innerText = "PLAY AGAIN";
        playBtn.onclick = () => { postMenu.style.display = 'none'; document.getElementById('start-btn').click(); };
    }
    if (isHost) broadcast({ type: 'GAME_STATE', players, apple, countdown, state: gameState });
}

document.getElementById('pause-trigger').onclick = () => togglePause();
document.getElementById('resume-btn').onclick = () => togglePause();
document.getElementById('quit-btn').onclick = () => location.reload();
document.getElementById('quit-post-btn').onclick = () => location.reload();

window.onload = () => { 
    addPlayer(); 
    setupMobileControls();
};