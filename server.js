const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { PeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/health', (req, res) => res.status(200).send('OK'));
app.use(express.static(path.join(__dirname)));

// Dynamic storage for multi-user rooms
const activeRooms = {}; 

io.on('connection', (socket) => {

    // Triggered when any unique creator generates a custom session link
    socket.on('create-room', ({ roomId, password, peerId }) => {
        activeRooms[roomId] = {
            creatorSocketId: socket.id,
            creatorPeerId: peerId,
            joinerPeerId: null,
            password: password, // Saved dynamically for this specific room
            status: 'waiting'
        };
        socket.join(roomId);
        console.log(`[Created] Room ${roomId} secured with custom passcode.`);
    });

    // Triggered when a guest attempts to unlock a shared link
    socket.on('join-room', ({ roomId, password, peerId }) => {
        const room = activeRooms[roomId];

        // 1. Strict Link Validation Checks
        if (!room || room.status === 'expired') {
            socket.emit('room-error', 'Link Not Found: This session has expired or never existed.');
            return socket.disconnect();
        }
        if (room.status === 'active') {
            socket.emit('room-error', 'Link Expired: This call room is currently occupied.');
            return socket.disconnect();
        }
        if (room.password !== password) {
            socket.emit('auth-error', 'Access Denied: Invalid Passcode for this specific call.');
            return socket.disconnect();
        }

        // 2. Lock the single-use room immediately
        socket.join(roomId);
        room.joinerPeerId = peerId;
        room.status = 'active';

        // 3. Inform the creator precisely that their peer has entered
        io.to(roomId).emit('peer-status-change', { 
            connected: true, 
            targetPeerId: room.creatorPeerId 
        });
        
        // Pass the creator's ID back to the joiner to kick off the connection call
        socket.emit('peer-status-change', { 
            connected: true, 
            targetPeerId: room.creatorPeerId 
        });
    });

    // Triggers instantly if a mobile tab closes, crashes, or loses cell connection
    socket.on('disconnect', () => {
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            if (room.creatorSocketId === socket.id || room.status === 'active') {
                io.to(roomId).emit('peer-status-change', { connected: false });
                delete activeRooms[roomId]; // Erased from server RAM completely
                console.log(`[Destroyed] Room ${roomId} permanently purged.`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    // Start Peer network server inline alongside main app port
    PeerServer({ port: 9000, path: '/myapp' });
});
