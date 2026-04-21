const Mods = {
    powerState: { active: false, timer: 0, ownerIdx: null },
    portals: [{ x: 120, y: 120, color: '#bf94ff' }, { x: 680, y: 380, color: '#bf94ff' }],

    initMode(mode) {
        this.powerState.active = false;
        if (mode === 'hvsh') return "MODE: HUNTER vs RUNNERS - TOUCH TO KILL";
        if (mode === 'portal') return "MODE: PORTAL - WARP THROUGH GATES";
        if (mode === 'glitch') return "MODE: GLITCH - RANDOM MUTATIONS";
        if (mode === 'wall') return "MODE: SNAKE WALL - PERMANENT TRAILS";
        return "MODE: CLASSIC RACE";
    },

    updatePower() {
        if (this.powerState.active) {
            this.powerState.timer--;
            if (this.powerState.timer <= 0) {
                this.powerState.active = false;
                this.powerState.ownerIdx = null;
            }
        }
    },

    checkCollision(players, mode) {
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            
            // HVSH Specific Logic
            if (mode === 'hvsh') {
                for (let j = 0; j < players.length; j++) {
                    if (i === j) continue;
                    if (players[j].cells.some(c => p.x === c.x && p.y === c.y)) {
                        if (i === 0) return { winner: "HUNTER (P1)", msg: "PREY ELIMINATED" };
                        if (this.powerState.active && this.powerState.ownerIdx === i && j === 0) {
                            return { winner: `RUNNER (P${i+1})`, msg: "HUNTER EXTERMINATED" };
                        }
                    }
                }
                continue; 
            }

            // Standard Collision
            for (let j = 0; j < players.length; j++) {
                const other = players[j];
                const startIdx = (i === j) ? 1 : 0;
                for (let k = startIdx; k < other.cells.length; k++) {
                    if (p.x === other.cells[k].x && p.y === other.cells[k].y) {
                        return { winner: "SURVIVORS", msg: `P${i+1} DISCONNECTED` }; 
                    }
                }
            }
        }
        return null;
    }
};