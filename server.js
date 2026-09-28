const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/health', (req, res) => res.status(200).send('OK'));
app.use(express.static(path.join(__dirname)));

const activeRooms = {}; 

io.on('connection', (socket) => {
    
    // Creator registers a custom PIN & Password
    socket.on('create-room', ({ roomId, password, peerId }) => {
        activeRooms[roomId] = {
            creatorSocketId: socket.id,
            creatorPeerId: peerId,
            joinerPeerId: null,
            password: password,
            status: 'waiting'
        };
        socket.join(roomId);
        console.log(`[Created] Room PIN: ${roomId} with custom password.`);
    });

    // Joiner unlocks the room using the PIN & Password
    socket.on('join-room', ({ roomId, password, peerId }) => {
        const room = activeRooms[roomId];

        if (!room || room.status === 'expired') {
            socket.emit('room-error', 'PIN Not Found: This session has expired or never existed.');
            return socket.disconnect();
        }
        if (room.status === 'active') {
            socket.emit('room-error', 'PIN Expired: This call room is already occupied.');
            return socket.disconnect();
        }
        if (room.password !== password) {
            socket.emit('auth-error', 'Access Denied: Invalid Passcode.');
            return socket.disconnect();
        }

        // Successfully unlocked! Lock room from future entries
        socket.join(roomId);
        room.joinerPeerId = peerId;
        room.status = 'active';

        // Connect the creator and the joiner simultaneously
        io.to(room.creatorSocketId).emit('peer-status-change', { 
            connected: true, 
            isCreator: true,
            targetPeerId: peerId // Send the joiner's peer ID to creator
        });
        
        socket.emit('peer-status-change', { 
            connected: true, 
            isCreator: false,
            targetPeerId: room.creatorPeerId // Send the creator's peer ID to joiner
        });
        console.log(`[Active] Call connected inside Room ${roomId}`);
    });

    socket.on('disconnect', () => {
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            if (room.creatorSocketId === socket.id || room.joinerPeerId === socket.id) {
                io.to(roomId).emit('peer-disconnected');
                delete activeRooms[roomId]; 
                console.log(`[Purged] Room PIN ${roomId} completely deleted from server memory.`);
            }
        }
    });
});

// FIXED: Listen to the network port first to prevent Render container dropouts
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on port ${PORT}`);
    
    // Mount the PeerJS Engine onto the initialized live server port
    const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
    app.use('/peerjs', peerServer);
});
