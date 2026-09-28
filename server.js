const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

app.get('/health', (req, res) => res.status(200).send('OK'));
app.use(express.static(path.join(__dirname)));

const activeRooms = {}; 

io.on('connection', (socket) => {
    
    // Creator establishes a room with a 6-Digit ID and Password
    socket.on('create-room', ({ roomId, password, peerId }) => {
        activeRooms[roomId] = {
            creatorSocketId: socket.id,
            creatorPeerId: peerId,
            joinerPeerId: null,
            password: password,
            status: 'waiting'
        };
        socket.join(roomId);
        console.log(`[Created] Room PIN: ${roomId}`);
    });

    // Joiner unlocks the room using the 6-Digit ID and Password
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

        socket.join(roomId);
        room.joinerPeerId = peerId;
        room.status = 'active';

        io.to(roomId).emit('peer-status-change', { 
            connected: true, 
            isCreator: true,
            targetPeerId: room.creatorPeerId 
        });
        
        socket.emit('peer-status-change', { 
            connected: true, 
            isCreator: false,
            targetPeerId: room.creatorPeerId 
        });
    });

    socket.on('disconnect', () => {
        for (const roomId in activeRooms) {
            const room = activeRooms[roomId];
            if (room.creatorSocketId === socket.id || room.status === 'active') {
                io.to(roomId).emit('peer-disconnected');
                delete activeRooms[roomId]; 
                console.log(`[Purged] Room PIN ${roomId} completely deleted.`);
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Server live on port ${PORT}`));
