const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer'); // Integrated directly into Express
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

// Share the main web port for Peer data transfers (eliminates Port 9000 error)
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/'
});
app.use('/peerjs', peerServer);

app.get('/health', (req, res) => res.status(200).send('OK'));
app.use(express.static(path.join(__dirname)));

const activeRooms = {}; 

io.on('connection', (socket) => {
    
    socket.on('create-room', ({ roomId, password, peerId }) => {
        activeRooms[roomId] = {
            creatorSocketId: socket.id,
            creatorPeerId: peerId,
            joinerPeerId: null,
            password: password,
            status: 'waiting'
        };
        socket.join(roomId);
        console.log(`Room created: ${roomId}`);
    });

    socket.on('join-room', ({ roomId, password, peerId }) => {
        const room = activeRooms[roomId];

        if (!room || room.status === 'expired') {
            socket.emit('room-error', 'Link Not Found: This session has expired.');
            return socket.disconnect();
        }
        if (room.status === 'active') {
            socket.emit('room-error', 'Link Expired: This call is already occupied.');
            return socket.disconnect();
        }
        if (room.password !== password) {
            socket.emit('auth-error', 'Access Denied: Invalid Passcode.');
            return socket.disconnect();
        }

        socket.join(roomId);
        room.joinerPeerId = peerId;
        room.status = 'active';

        // Connect the link creator and the friend seamlessly
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
                io.to(roomId).emit('peer-status-change', { connected: false });
                delete activeRooms[roomId]; 
                console.log(`Room purged: ${roomId}`);
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Server live on port ${PORT}`));
