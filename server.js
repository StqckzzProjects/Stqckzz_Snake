const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS allowed for mobile/external testing
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files (HTML, CSS, JS) from the root directory
app.use(express.static(__dirname));

// Keep track of all connected players
let players = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Create a new player entry upon connection
    players[socket.id] = {
        id: socket.id,
        x: Math.floor(Math.random() * 20) * 20, // Random start position
        y: Math.floor(Math.random() * 20) * 20,
        color: getRandomColor(),
        score: 0
    };

    // 2. Send the current players list to the NEW player only
    socket.emit('currentPlayers', players);

    // 3. Update all OTHER players about the new arrival
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // 4. Handle movement data sent from the client (game.js)
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].score = movementData.score;
            
            // Broadcast the movement to everyone so they see the snake move
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 5. Handle Chat or Status messages (Optional)
    socket.on('statusUpdate', (msg) => {
        io.emit('displayStatus', msg);
    });

    // 6. Handle Disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Remove player from the object
        delete players[socket.id];
        // Tell everyone else to remove this snake from their screen
        io.emit('playerDisconnected', socket.id);
    });
});

// Helper function to generate a random neon color
function getRandomColor() {
    const colors = ['#00d2ff', '#9d50bb', '#3fb950', '#ff3131', '#f2ff00'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// IMPORTANT: Use process.env.PORT for Render/Railway deployment
// Use 0.0.0.0 to allow external mobile devices to connect
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- SNAKE_OS SERVER LIVE ---`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Listening on all network interfaces (0.0.0.0)`);
});