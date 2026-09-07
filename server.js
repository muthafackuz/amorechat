const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Задаваме парола за администратора
const ADMIN_PASSWORD = "moja-taina-parola";

// Казваме на сървъра изрично да отваря index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    let username = "Анонимен";
    let isAdmin = false;

    socket.on('join', (name, password) => {
        username = name;
        if (name.toLowerCase() === 'admin' && password === ADMIN_PASSWORD) {
            isAdmin = true;
            socket.emit('system-message', 'Вие влязохте като АДМИНИСТРАТОР!');
        }
        io.emit('system-message', `${username} се присъедини към чата.`);
    });

    socket.on('chat-message', (msg) => {
        if (isAdmin && msg.startsWith('/kick ')) {
            const target = msg.replace('/kick ', '').trim();
            io.emit('kick-user', target);
            io.emit('system-message', `${target} беше изгонен от Администратора.`);
            return;
        }

        io.emit('broadcast-message', {
            user: username,
            text: msg,
            isAdmin: isAdmin
        });
    });

    socket.on('disconnect', () => {
        io.emit('system-message', `${username} напусна чата.`);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
