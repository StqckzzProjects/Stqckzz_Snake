const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const grid = 20;

let gameState = 'MENU';
let countdown = 3;
let binding = null;
let canTurn = true;

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

function resize() { canvas.width = 800; canvas.height = 500; }
window.addEventListener('resize', resize);
resize();

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
        
        // When someone joins, add a player slot immediately
        addPlayer(); 

        c.on('open', () => {
            // Send full lobby data the moment the connection is open
            c.send({ type: 'LOBBY_SYNC', configs: activeConfigs });
        });

        c.on('data', (data) => {
            if (data.type === 'INPUT' && isHost) {
                const pIdx = clients.indexOf(c) + 1;
                handleDirectionChange(pIdx, data.key);
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
            // CRITICAL: Joiner updates their local menu when host sends data
            if (data.type === 'LOBBY_SYNC') { 
                activeConfigs = data.configs; 
                renderMenu(); 
            }
            if (data.type === 'GAME_STATE') { 
                players = data.players; 
                apple = data.apple; 
                countdown = data.countdown; 
                gameState = data.state; 
                // Close menu if game started while we were joining
                if (gameState !== 'MENU') document.getElementById('main-menu').style.display = 'none';
            }
            if (data.type === 'START') { startLocalGame(data.mode); }
        });
    });
};

function broadcast(data) {
    if (isHost) clients.forEach(c => {
        if (c.open) c.send(data);
    });
}

// --- CORE MENU & PLAYER LOGIC ---

function updatePlayerConfig(idx, key, value) {
    activeConfigs[idx][key] = value;
    renderMenu();
    if (isHost) broadcast({ type: 'LOBBY_SYNC', configs: activeConfigs });
}

function addPlayer() {
    if (activeConfigs.length >= 4) return;
    const i = activeConfigs.length;
    activeConfigs.push({ 
        ...playerDefs[i], 
        keys: [[87,83,65,68], [38,40,37,39], [73,75,74,76], [104,101,100,102]][i] 
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
    const canEdit = !isOnline || isHost;

    container.innerHTML = activeConfigs.map((p, i) => `
        <div class="player-config">
            ${(canEdit && activeConfigs.length > 1) ? `<button class="remove-btn" onclick="removePlayer(${i})">×</button>` : ''}
            <span style="font-size:10px; color:var(--neon-blue); font-weight:bold;">PLAYER ${i+1}</span>
            <input type="text" onchange="updatePlayerConfig(${i}, 'name', this.value)" value="${p.name}" class="name-input" ${!canEdit ? 'readonly' : ''}>
            <input type="color" onchange="updatePlayerConfig(${i}, 'color', this.value)" value="${p.color}" class="color-picker" ${!canEdit ? 'disabled' : ''} 
                style="width:40px; height:40px; cursor:pointer; background:none; border:none; filter: drop-shadow(0 0 5px ${p.color});">
            <div class="key-grid">
                <button style="grid-area: u">${keyMap[p.keys[0]] || '?'}</button>
                <button style="grid-area: l">${keyMap[p.keys[2]] || '?'}</button>
                <button style="grid-area: d">${keyMap[p.keys[1]] || '?'}</button>
                <button style="grid-area: r">${keyMap[p.keys[3]] || '?'}</button>
            </div>
        </div>
    `).join('');

    if (canEdit && activeConfigs.length < 4) {
        container.innerHTML += `<div class="add-player-btn" onclick="addPlayer()"><span>+</span><p>ADD PLAYER</p></div>`;
    }
}

// --- GAMEPLAY LOOP ---

window.addEventListener('keydown', e => {
    if (gameState !== 'PLAYING') return;
    if (!isOnline || isHost) {
        activeConfigs.forEach((config, i) => {
            if (!isOnline || i === 0) handleDirectionChange(i, e.keyCode);
        });
    } 
    if (isOnline && !isHost && conn && conn.open) {
        conn.send({ type: 'INPUT', key: e.keyCode });
    }
});

function handleDirectionChange(pIdx, keyCode) {
    const p = players[pIdx];
    if (!p) return;
    const [u, d, l, r] = activeConfigs[pIdx].keys;
    if (keyCode === l && p.dx === 0) { p.dx = -grid; p.dy = 0; }
    else if (keyCode === u && p.dy === 0) { p.dy = -grid; p.dx = 0; }
    else if (keyCode === r && p.dx === 0) { p.dx = grid; p.dy = 0; }
    else if (keyCode === d && p.dy === 0) { p.dy = grid; p.dx = 0; }
}

function update() {
    if (gameState === 'MENU') return;

    setTimeout(() => {
        requestAnimationFrame(update);
        if (!isOnline || isHost) {
            if (gameState === 'PLAYING') {
                const mode = document.getElementById('game-mode').value;
                players.forEach((p, i) => {
                    p.x += p.dx; p.y += p.dy;
                    if (p.x < 0) p.x = canvas.width - grid; else if (p.x >= canvas.width) p.x = 0;
                    if (p.y < 0) p.y = canvas.height - grid; else if (p.y >= canvas.height) p.y = 0;
                    p.cells.unshift({x: p.x, y: p.y});
                    if (p.cells.length > p.maxCells) p.cells.pop();
                    if (p.x === apple.x && p.y === apple.y) { p.maxCells++; spawnApple(); }
                });
                const col = Mods.checkCollision(players, mode);
                if (col) { alert(col.winner + " Wins!"); location.reload(); }
            }
            if (isHost) broadcast({ type: 'GAME_STATE', players, apple, countdown, state: gameState });
        }

        ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        players.forEach((p, i) => {
            if (!activeConfigs[i]) return; // Safety check
            ctx.fillStyle = activeConfigs[i].color;
            p.cells.forEach(c => ctx.fillRect(c.x, c.y, grid-1, grid-1));
        });
        ctx.fillStyle = "#ff3131"; ctx.beginPath();
        ctx.arc(apple.x + 10, apple.y + 10, 8, 0, Math.PI*2); ctx.fill();

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
    players = activeConfigs.map(c => ({ ...c, cells: [{x: c.x, y: c.y}], maxCells: 5 }));
    gameState = 'STARTING';
    document.getElementById('main-menu').style.display = 'none';
    countdown = 3;
    let timer = setInterval(() => {
        countdown--;
        if (countdown <= 0) { clearInterval(timer); gameState = 'PLAYING'; }
    }, 1000);
    update();
}

addPlayer();