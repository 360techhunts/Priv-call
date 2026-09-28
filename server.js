const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable Cross-Origin requests for Render's routing
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Mandatory health check route for cloud platform confirmation
app.get('/health', (req, res) => res.status(200).send('OK'));

// Serve your mobile front-end files
app.use(express.static(path.join(__dirname)));

// 🔒 CHANGE THIS to your private group passcode
const MASTER_PASSWORD = "SecretGroupPasscode2026"; 

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, password }) => {
        if (password !== MASTER_PASSWORD) {
            socket.emit('auth-failed', 'Access Denied: Invalid Passcode.');
            return socket.disconnect();
        }

        socket.join(roomId);
        
        if (rooms[roomId]) {
            socket.to(roomId).emit('peer-joined');
        } else {
            rooms[roomId] = true;
        }

        socket.on('signal', (data) => {
            socket.to(roomId).emit('signal', data);
        });

        socket.on('disconnect', () => {
            socket.leave(roomId);
            if (rooms[roomId]) delete rooms[roomId];
            socket.to(roomId).emit('peer-disconnected');
        });
    });
});

// Force bind to all network interfaces for mobile distribution
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
