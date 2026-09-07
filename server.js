const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const mutedUsers = new Set();
const bannedUsers = new Set();
const onlineSockets = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    let userNickname = "";
    let userRole = "user";

    // Потребителят вече се е логнал в браузъра и просто изпраща данните си на сървъра
    socket.on('join-verified-user', (userData) => {
        userNickname = userData.nickname;
        userRole = userData.role;
        onlineSockets[userNickname] = socket;

        io.emit('system-message', `✨ Потребител ${userNickname} влезе в Amore Club.`);
    });

    socket.on('chat-message', (msg) => {
        if (!userNickname) return;
        if (mutedUsers.has(userNickname)) {
            return socket.emit('system-message', '🔇 Вие сте заглушен от Администратора!');
        }

        io.emit('broadcast-message', {
            user: userNickname,
            text: msg,
            role: userRole
        });
    });

    socket.on('admin-action', (data) => {
        if (userRole !== 'admin') return; 
        const { action, targetName } = data;
        const targetSocket = onlineSockets[targetName];

        if (action === 'kick') {
            io.emit('system-message', `🚨 ${targetName} беше изгонен.`);
            if (targetSocket) targetSocket.emit('kick-user');
        } else if (action === 'mute') {
            mutedUsers.add(targetName);
            io.emit('system-message', `🔇 ${targetName} беше заглушен.`);
        } else if (action === 'ban') {
            bannedUsers.add(targetName);
            io.emit('system-message', `🚫 ${targetName} получи постоянен БАН!`);
            if (targetSocket) targetSocket.emit('kick-user');
        }
    });

    socket.on('disconnect', () => {
        if (userNickname) {
            delete onlineSockets[userNickname];
            io.emit('system-message', `👋 ${userNickname} напусна стаята.`);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
