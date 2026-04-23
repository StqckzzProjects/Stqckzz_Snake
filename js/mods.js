const Mods = {
    powerState: { active: false, timer: 0, ownerIdx: null },
    gameTimer: 0,
    headstart: 0, 
    // lastUsed prevents the infinite teleport loop between portals
    portals: [
        { x: 120, y: 120, color: '#00d2ff', lastUsed: 0 }, 
        { x: 680, y: 380, color: '#9d50bb', lastUsed: 0 }
    ],

    initMode(mode, players) {
        this.powerState.active = false;
        
        // --- TIMER SETUP ---
        if (mode === 'casual') {
            this.gameTimer = 999999; // Effectively infinite
        } else {
            this.gameTimer = (mode === 'hvsh') ? 60 : 45;
        }
        
        this.headstart = (mode === 'hvsh') ? 5 : 0; 

        // --- RANDOMIZED HUNTER LOGIC ---
        let hunterCount = 1;
        if (mode === 'hvsh' && players.length > 2) {
            hunterCount = Math.random() < 0.3 ? 2 : 1;
        }

        let indices = players.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const selectedHunterIndices = indices.slice(0, hunterCount);

        players.forEach((p, i) => {
            p.isDead = false;
            p.maxCells = 5;
            p.cells = []; // Clear old body
            
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
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = "bold 20px 'Courier New'";
        ctx.textAlign = "center";
        
        // 1. Timer Display
        if (mode === 'casual') {
            ctx.fillText("CASUAL ARENA", canvas.width / 2, 35);
        } else if (this.headstart > 0) {
            ctx.fillStyle = "#ff3131";
            ctx.fillText(`HUNTER RELEASE IN: ${Math.ceil(this.headstart)}s`, canvas.width / 2, 35);
        } else {
            ctx.fillText(`TIME LEFT: ${Math.ceil(this.gameTimer)}s`, canvas.width / 2, 35);
        }

        // 2. Score Bar
        const barY = canvas.height - 15;
        const sectionWidth = canvas.width / players.length;
        players.forEach((p, i) => {
            if (p.isDead) return;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(i * sectionWidth + 20, barY - 5, 6, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "#fff";
            ctx.font = "12px monospace";
            ctx.textAlign = "left";
            const label = (mode === 'hvsh') ? (p.role === 'hunter' ? "HUNT" : "RUN") : p.name;
            ctx.fillText(`${label}: ${p.maxCells - 5}`, i * sectionWidth + 32, barY);
        });

        // 3. Portals
        if (mode === 'portal') {
            this.portals.forEach(pt => {
                ctx.strokeStyle = pt.color;
                ctx.lineWidth = 3;
                ctx.strokeRect(pt.x, pt.y, 20, 20);
                ctx.shadowBlur = 10 + Math.sin(Date.now() / 200) * 5;
                ctx.shadowColor = pt.color;
                ctx.strokeRect(pt.x + 4, pt.y + 4, 12, 12);
                ctx.shadowBlur = 0;
            });
        }
    },

    applyRules(players, mode) {
        // Handle Timers
        if (this.headstart > 0) this.headstart -= 0.1; 
        else if (this.gameTimer > 0 && mode !== 'casual') this.gameTimer -= 0.1;

        players.forEach((p) => {
            if (p.isDead) return;

            // Portal Logic
            if (mode === 'portal') {
                this.portals.forEach((gate, gIdx) => {
                    const now = Date.now();
                    if (p.x === gate.x && p.y === gate.y && (now - gate.lastUsed > 500)) {
                        const exit = this.portals[gIdx === 0 ? 1 : 0];
                        p.x = exit.x; 
                        p.y = exit.y;
                        this.portals[0].lastUsed = now;
                        this.portals[1].lastUsed = now;
                    }
                });
            }

            // Glitch Mode Randomness
            if (mode === 'glitch' && Math.random() < 0.02) { 
                p.maxCells += (Math.random() > 0.5 ? 1 : -1);
                if(p.maxCells < 3) p.maxCells = 3;
            }
        });
    },

    checkCollision(players, mode) {
        // Timer Win Condition (Skip for Casual)
        if (mode !== 'casual' && this.gameTimer <= 0) {
            if (mode === 'hvsh') return { winner: "RUNNERS", msg: "TIME EXPIRED" };
            const winner = players.reduce((prev, curr) => (prev.maxCells > curr.maxCells) ? prev : curr);
            return { winner: winner.name, msg: "HIGH SCORE WINS" };
        }

        // --- MODE SPECIFIC COLLISION ---
        if (mode === 'hvsh') {
            const hunters = players.filter(p => p.role === 'hunter' && !p.isDead);
            const runners = players.filter(p => p.role === 'runner' && !p.isDead);

            for (let r of runners) {
                // Runner vs Hunter
                for (let h of hunters) {
                    if (r.cells.some(c => h.x === c.x && h.y === c.y)) {
                        r.isDead = true; r.cells = [];
                    }
                }
                // Runner vs Self/Other Runners
                r.cells.forEach((cell, index) => {
                    if (index === 0) return;
                    if (r.x === cell.x && r.y === cell.y) { r.isDead = true; r.cells = []; }
                });
            }

            if (runners.length > 0 && runners.every(r => r.isDead)) {
                return { winner: "HUNTERS", msg: "ALL RUNNERS CAUGHT" };
            }
        } else {
            // Standard Collision (Casual/Classic/Portal/Glitch)
            for (let p of players) {
                if (p.isDead) continue;
                for (let other of players) {
                    if (other.isDead) continue;
                    other.cells.forEach((cell, index) => {
                        if (p === other && index === 0) return; 
                        if (p.x === cell.x && p.y === cell.y) {
                            if (mode === 'casual') {
                                // Respawn logic for casual
                                p.x = Math.floor(Math.random() * 20) * 20;
                                p.y = Math.floor(Math.random() * 20) * 20;
                                p.cells = [];
                                p.maxCells = 5;
                            } else {
                                p.isDead = true;
                                p.cells = [];
                            }
                        }
                    });
                }
            }
        }

        // Win Condition (Skip for Casual)
        if (mode !== 'casual') {
            const alive = players.filter(p => !p.isDead);
            if (alive.length === 1 && players.length > 1) {
                return { winner: alive[0].name, msg: "LAST SNAKE STANDING" };
            }
        }

        return null;
    }
};