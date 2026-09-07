const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Нашата вградена локална база данни за профили
const usersDB = {}; 
const mutedUsers = new Set();
const bannedUsers = new Set();
const onlineSockets = {};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    let currentNickname = "";
    let currentRole = "user";

    // Логика за Регистрация или Вход
    socket.on('auth-action', (data) => {
        const { email, password, nickname, age, gender, info, isRegister } = data;
        const cleanEmail = email.toLowerCase().trim();

        if (bannedUsers.has(cleanEmail) || (nickname && bannedUsers.has(nickname.toLowerCase()))) {
            return socket.emit('auth-error', '🚫 Този акаунт или никнейм има постоянен БАН!');
        }

        if (isRegister) {
            // Проверка дали никнеймът или имейлът вече съществуват
            for (let uid in usersDB) {
                if (usersDB[uid].email === cleanEmail) {
                    return socket.emit('auth-error', 'Имейлът вече е регистриран!');
                }
                if (usersDB[uid].nickname.toLowerCase() === nickname.toLowerCase()) {
                    return socket.emit('auth-error', 'Този никнейм вече е зает!');
                }
            }

            // Създаване на нов профил
            const uid = "_" + Math.random().toString(36).substr(2, 9);
            
            // ГАРАНТИРАНО АДМИН ПРАВО: Първият регистриран с ник Admin или с този имейл става главен шеф
            const role = (cleanEmail === 'admin@amoreclub.net' || nickname.toLowerCase() === 'admin' || nickname.toLowerCase() === 'pavel') ? 'admin' : 'user';

            const newProfile = { uid, email: cleanEmail, password, nickname, age, gender, info, role };
            usersDB[uid] = newProfile;

            currentNickname = nickname;
            currentRole = role;
            onlineSockets[currentNickname] = socket;

            socket.emit('auth-success', newProfile);
            io.emit('system-message', `🎉 Нов регистриран член в клуба: ${currentNickname}!`);
        } else {
            // Вход
            let foundUser = null;
            for (let uid in usersDB) {
                if (usersDB[uid].email === cleanEmail && usersDB[uid].password === password) {
                    foundUser = usersDB[uid];
                    break;
                }
            }

            if (!foundUser) {
                return socket.emit('auth-error', 'Грешен имейл или парола! Опитайте пак или се регистрирайте.');
            }

            currentNickname = foundUser.nickname;
            currentRole = foundUser.role;
            onlineSockets[currentNickname] = socket;

            socket.emit('auth-success', foundUser);
            io.emit('system-message', `✨ ${currentNickname} влезе в стаята.`);
        }
    });

    // Изпращане на съобщение
    socket.on('chat-message', (msg) => {
        if (!currentNickname) return;
        if (mutedUsers.has(currentNickname)) {
            return socket.emit('system-message', '🔇 Вие сте заглушен от Администратора!');
        }

        io.emit('broadcast-message', {
            user: currentNickname,
            text: msg,
            role: currentRole
        });
    });

    // Запитване за преглед на нечий профил (при клик на име)
    socket.on('get-user-profile', (targetName) => {
        let foundProfile = null;
        for (let uid in usersDB) {
            if (usersDB[uid].nickname === targetName) {
                foundProfile = usersDB[uid];
                break;
            }
        }
        if (foundProfile) {
            socket.emit('receive-user-profile', {
                nickname: foundProfile.nickname,
                age: foundProfile.age,
                gender: foundProfile.gender,
                info: foundProfile.info,
                role: foundProfile.role
            });
        }
    });

    // 👑 АДМИН ПАНЕЛ (Kick, Mute, Ban)
    socket.on('admin-action', (data) => {
        if (currentRole !== 'admin') return; 
        const { action, targetName } = data;
        const targetSocket = onlineSockets[targetName];

        if (action === 'kick') {
            io.emit('system-message', `🚨 Потребителят ${targetName} беше изгонен от Администратора.`);
            if (targetSocket) targetSocket.emit('kick-user');
        } else if (action === 'mute') {
            mutedUsers.add(targetName);
            io.emit('system-message', `🔇 Потребителят ${targetName} беше заглушен.`);
        } else if (action === 'ban') {
            bannedUsers.add(targetName.toLowerCase());
            io.emit('system-message', `🚫 Потребителят ${targetName} получи постоянен БАН от клуба!`);
            if (targetSocket) targetSocket.emit('kick-user');
        }
    });

    socket.on('disconnect', () => {
        if (currentNickname) {
            delete onlineSockets[currentNickname];
            io.emit('system-message', `👋 ${currentNickname} напусна стаята.`);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Premium Local-DB Chat running on port ${PORT}`);
});
