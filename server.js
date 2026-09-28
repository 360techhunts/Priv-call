const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable Cross-Origin requests for mobile socket routing
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Mandatory health check route for cloud platform confirmation
app.get('/health', (req, res) => res.status(200).send('OK'));

// Serve your mobile front-end interface files
app.use(express.static(path.join(__dirname)));

// 🔒 CHANGE THIS to your private group passcode
const MASTER_PASSWORD = "reddy"; 

// Tracks active rooms and their lifecycle states in temporary RAM
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

    // Triggered when the partner joins via the shared room link
    socket.on('join-room', ({ roomId, password }) => {
        if (password !== MASTER_PASSWORD) {
            socket.emit('auth-failed', 'Access Denied: Invalid Passcode.');
            return socket.disconnect();
        }

        // Validate if the room exists or is active
        if (!activeRooms[roomId]) {
            socket.emit('room-not-found', 'Link Not Found: This session has expired or never existed.');
            return socket.disconnect();
        }

        if (activeRooms[roomId].status === 'active') {
            socket.emit('room-not-found', 'Link Expired: This call room is already occupied.');
            return socket.disconnect();
        }

        // Connect the peer and lock down the room
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

// Force bind to all network interfaces for mobile deployment routing
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
