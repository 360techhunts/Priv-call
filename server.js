const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.use(express.static(path.join(__dirname)));

// 🔒 CHANGE THIS to your private group passcode
const MASTER_PASSWORD = "SecretGroupPasscode2026"; 

// Tracks active rooms and their specific lifecycles
const activeRooms = {}; 

io.on('connection', (socket) => {

    // Triggered ONLY when the creator taps the button
    socket.on('create-room', ({ roomId, password }) => {
        if (password !== MASTER_PASSWORD) {
            return socket.emit('auth-failed', 'Access Denied.');
        }
        activeRooms[roomId] = { creatorId: socket.id, status: 'waiting' };
        socket.join(roomId);
    });

    // Triggered when someone opens a link
    socket.on('join-room', ({ roomId, password }) => {
        if (password !== MASTER_PASSWORD) {
            socket.emit('auth-failed', 'Access Denied: Invalid Passcode.');
            return socket.disconnect();
        }

        // Check if the room exists and is valid
        if (!activeRooms[roomId]) {
            socket.emit('room-not-found', 'Link Not Found: This session has expired or never existed.');
            return socket.disconnect();
        }

        if (activeRooms[roomId].status === 'active') {
            socket.emit('room-not-found', 'Link Expired: This call room is already occupied.');
            return socket.disconnect();
        }

        // If valid, connect the peer and lock down the room
        socket.join(roomId);
        activeRooms[roomId].status = 'active';
        socket.to(roomId).emit('peer-joined');

        socket.on('signal', (data) => {
            socket.to(roomId).emit('signal', data);
        });
    });

    // Triggers instantly the absolute moment a browser tab closes or refreshes
    socket.on('disconnect', () => {
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            
            // If either participant leaves, destroy the room identifier completely
            if (room.creatorId === socket.id || room.status === 'active') {
                socket.to(roomId).emit('peer-disconnected');
                delete activeRooms[roomId]; // Erased from server RAM instantly
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
