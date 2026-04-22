const Mods = {
    powerState: { active: false, timer: 0, ownerIdx: null },
    gameTimer: 0,
    headstart: 0, 
    portals: [{ x: 120, y: 120, color: '#00d2ff' }, { x: 680, y: 380, color: '#9d50bb' }],
    mutations: ['speed-boost', 'slow-motion', 'invert-controls'],

    initMode(mode, players) {
        this.powerState.active = false;
        this.gameTimer = (mode === 'hvsh') ? 60 : 45;
        this.headstart = (mode === 'hvsh') ? 5 : 0; 

        // --- RANDOMIZED HUNTER LOGIC ---
        let hunterCount = 1;
        // 30% chance for 2 hunters if 3+ players are present
        if (mode === 'hvsh' && players.length > 2) {
            hunterCount = Math.random() < 0.3 ? 2 : 1;
        }

        // Shuffle player indices to pick hunters randomly
        let indices = players.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const selectedHunterIndices = indices.slice(0, hunterCount);

        players.forEach((p, i) => {
            p.isDead = false;
            p.score = 0;
            
            if (mode === 'hvsh') {
                p.role = selectedHunterIndices.includes(i) ? 'hunter' : 'runner';
            } else {
                p.role = 'neutral';
            }
        });

        if (mode === 'hvsh') {
            const hunterNames = players
                .filter(p => p.role === 'hunter')
                .map(p => p.name.toUpperCase());
            return hunterNames.length > 1 
                ? `HUNTERS: ${hunterNames.join(' & ')}` 
                : `HUNTER: ${hunterNames[0]}`;
        }
        return mode.toUpperCase() + " ACTIVE";
    },

    drawUI(ctx, canvas, players, mode) {
        // 1. Draw Timer
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = "bold 20px 'Courier New'";
        ctx.textAlign = "center";
        
        if (this.headstart > 0) {
            ctx.fillStyle = "#ff3131";
            ctx.fillText(`HUNTER RELEASE IN: ${Math.ceil(this.headstart)}s`, canvas.width / 2, 35);
        } else {
            ctx.fillText(`TIME LEFT: ${Math.ceil(this.gameTimer)}s`, canvas.width / 2, 35);
        }

        // 2. Draw Score Bar
        const barY = canvas.height - 25;
        const sectionWidth = canvas.width / players.length;
        players.forEach((p, i) => {
            if (p.isDead) return;
            ctx.fillStyle = p.color;
            ctx.fillRect(i * sectionWidth + 10, barY - 12, 12, 12);
            ctx.fillStyle = "#fff";
            ctx.font = "12px monospace";
            ctx.textAlign = "left";
            const label = (mode === 'hvsh') ? (p.role === 'hunter' ? "HUNT" : "RUN") : p.name;
            ctx.fillText(`${label}: ${p.maxCells - 5}`, i * sectionWidth + 28, barY - 2);
        });

        // 3. Draw Portals
        if (mode === 'portal') {
            this.portals.forEach(pt => {
                ctx.strokeStyle = pt.color;
                ctx.lineWidth = 3;
                ctx.strokeRect(pt.x, pt.y, 20, 20);
                ctx.shadowBlur = 15;
                ctx.shadowColor = pt.color;
                ctx.strokeRect(pt.x + 4, pt.y + 4, 12, 12);
                ctx.shadowBlur = 0;
            });
        }
    },

    applyRules(players, mode) {
        if (this.headstart > 0) this.headstart -= 0.1; 
        else if (this.gameTimer > 0) this.gameTimer -= 0.1;

        players.forEach((p) => {
            if (p.isDead) return;

            if (mode === 'portal') {
                this.portals.forEach((gate, gIdx) => {
                    if (p.x === gate.x && p.y === gate.y) {
                        const exit = this.portals[gIdx === 0 ? 1 : 0];
                        p.x = exit.x; p.y = exit.y;
                    }
                });
            }

            if (mode === 'glitch' && Math.random() < 0.01) { 
                p.maxCells += (Math.random() > 0.5 ? 1 : -1);
                if(p.maxCells < 2) p.maxCells = 2;
            }
        });
    },

    checkCollision(players, mode) {
        if (this.gameTimer <= 0) {
            const runners = players.filter(p => p.role === 'runner');
            // In HvSh, if time runs out, runners win. In other modes, high score wins.
            if (mode === 'hvsh' && runners.length > 0) {
                return { winner: "RUNNERS", msg: "TIME EXPIRED" };
            }
            const winner = players.reduce((prev, curr) => (prev.maxCells > curr.maxCells) ? prev : curr);
            return { winner: winner.name, msg: "TIME EXPIRED" };
        }

        // --- HUNTER VS RUNNER COLLISION ---
        if (mode === 'hvsh') {
            const hunters = players.filter(p => p.role === 'hunter' && !p.isDead);
            const runners = players.filter(p => p.role === 'runner' && !p.isDead);

            for (let r of runners) {
                for (let h of hunters) {
                    // Only check if Hunter Head touches Runner Body
                    // Runner has "collision off" for their own tail/other runners
                    if (r.cells.some(c => h.x === c.x && h.y === c.y)) {
                        r.isDead = true;
                        r.cells = [];
                    }
                }
            }

            const aliveRunners = runners.filter(r => !r.isDead);
            if (aliveRunners.length === 0) {
                return { winner: "HUNTERS", msg: "ALL RUNNERS CAUGHT" };
            }
            return null;
        }

        // --- STANDARD COLLISION (Classic, Portal, Glitch, Wall) ---
        for (let p of players) {
            if (p.isDead) continue;
            for (let other of players) {
                if (other.isDead) continue;
                other.cells.forEach((cell, index) => {
                    if (p === other && index === 0) return; // Don't collide with own head
                    if (p.x === cell.x && p.y === cell.y) {
                        p.isDead = true;
                        p.cells = [];
                    }
                });
            }
        }

        const alive = players.filter(p => !p.isDead);
        if (alive.length === 1 && players.length > 1) {
            return { winner: alive[0].name, msg: "LAST SNAKE STANDING" };
        }

        return null;
    }
};