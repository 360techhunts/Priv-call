const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

// 🔒 CHANGE THIS to your own private passcode
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
