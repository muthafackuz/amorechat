const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Парола за администратора (Можете да я смените тук)
const ADMIN_PASSWORD = "moja-taina-parola";

// Казваме на сървъра да показва HTML файла
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});


// Логика за комуникация в реално време
io.on('connection', (socket) => {
    let username = "Анонимен";
    let isAdmin = false;

    // Когато потребител влезе в чата
    socket.on('join', (name, password) => {
        username = name;
        if (name.toLowerCase() === 'admin' && password === ADMIN_PASSWORD) {
            isAdmin = true;
            socket.emit('system-message', 'Вие влязохте като АДМИНИСТРАТОР!');
        }
        io.emit('system-message', `${username} се присъедини към чата.`);
    });

    // Когато пристигне ново съобщение
    socket.on('chat-message', (msg) => {
        // Проверка за админ команди
        if (isAdmin && msg.startsWith('/kick ')) {
            const target = msg.replace('/kick ', '').trim();
            io.emit('kick-user', target);
            io.emit('system-message', `${target} беше изгонен от Администратора.`);
            return;
        }

        // Изпращане на съобщението до всички
        io.emit('broadcast-message', {
            user: username,
            text: msg,
            isAdmin: isAdmin
        });
    });

    // Когато някой затвори страницата
    socket.on('disconnect', () => {
        io.emit('system-message', `${username} напусна чата.`);
    });
});

// Порт за стартиране (Render ще подаде свой порт, локално е 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Чатът работи на порт ${PORT}`);
});
