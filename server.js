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
const bannedUsers = new Set(); // Пази баннатите никнеймове и имейли
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
        const cleanEmail = email ? email.toLowerCase().trim() : "";
        const cleanNickname = nickname ? nickname.trim() : "";

        // 🚨 ПРОВЕРКА ЗА БАН
        if (bannedUsers.has(cleanEmail) || bannedUsers.has(cleanNickname.toLowerCase())) {
            return socket.emit('auth-error', '🚫 Вие имате постоянен БАН от Amore Club и не можете да влезете!');
        }

        if (isRegister) {
            let existingUser = null;
            for (let uid in usersDB) {
                if (usersDB[uid].email === cleanEmail || usersDB[uid].nickname.toLowerCase() === cleanNickname.toLowerCase()) {
                    existingUser = usersDB[uid];
                    break;
                }
            }

            if (existingUser) {
                currentNickname = existingUser.nickname;
                currentRole = existingUser.role;
                onlineSockets[currentNickname] = socket;
                socket.emit('auth-success', existingUser);
                io.emit('system-message', `✨ ${currentNickname} влезе в стаята.`);
                return;
            }

            const uid = "_" + Math.random().toString(36).substr(2, 9);
            const role = (cleanEmail === 'admin@amoreclub.net' || cleanNickname.toLowerCase() === 'admin' || cleanNickname.toLowerCase() === 'pavel') ? 'admin' : 'user';

            const newProfile = { uid, email: cleanEmail, password, nickname: cleanNickname, age, gender, info, role };
            usersDB[uid] = newProfile;

            currentNickname = cleanNickname;
            currentRole = role;
            onlineSockets[currentNickname] = socket;

            socket.emit('auth-success', newProfile);
            io.emit('system-message', `🎉 Нов регистриран член в клуба: ${currentNickname}!`);
        } else {
            let foundUser = null;
            for (let uid in usersDB) {
                if (usersDB[uid].email === cleanEmail && usersDB[uid].password === password) {
                    foundUser = usersDB[uid];
                    break;
                }
            }

            if (!foundUser) {
                return socket.emit('auth-error', 'Грешен имейл или парола!');
            }

            currentNickname = foundUser.nickname;
            currentRole = foundUser.role;
            onlineSockets[currentNickname] = socket;

            socket.emit('auth-success', foundUser);
            io.emit('system-message', `✨ ${currentNickname} влезе в стаята.`);
        }
    });

    // Изпращане на съобщение + ТЕКСТОВИ АДМИН КОМАНДИ
    socket.on('chat-message', (msg) => {
        if (!currentNickname) return;

        // Команди само за Админа
        if (currentRole === 'admin') {
            if (msg.startsWith('/unmute ')) {
                const target = msg.replace('/unmute ', '').trim();
                if (mutedUsers.has(target)) {
                    mutedUsers.delete(target);
                    io.emit('system-message', `🔊 Потребителят ${target} беше амнистиран и може да пише.`);
                }
                return;
            }

            if (msg.startsWith('/unban ')) {
                const target = msg.replace('/unban ', '').trim();
                const targetLower = target.toLowerCase();
                
                let unbannedSomething = false;

                // 1. Махаме никнейма от списъка с банове
                if (bannedUsers.has(targetLower)) {
                    bannedUsers.delete(targetLower);
                    unbannedSomething = true;
                }

                // 2. Намираме имейла на този потребител и го махаме също от списъка с банове
                for (let uid in usersDB) {
                    if (usersDB[uid].nickname.toLowerCase() === targetLower) {
                        const userEmail = usersDB[uid].email.toLowerCase();
                        if (bannedUsers.has(userEmail)) {
                            bannedUsers.delete(userEmail);
                            unbannedSomething = true;
                        }
                        break;
                    }
                }

                if (unbannedSomething) {
                    io.emit('system-message', `🔓 Потребителят ${target} беше напълно амнистиран и неговият имейл и никнейм бяха отблокирани.`);
                } else {
                    socket.emit('system-message', `❌ Потребителят ${target} не беше намерен в списъка с активни банове.`);
                }
                return;
            }
        }

        if (mutedUsers.has(currentNickname)) {
            return socket.emit('system-message', '🔇 Вие сте заглушен от Администратора!');
        }

        io.emit('broadcast-message', {
            user: currentNickname,
            text: msg,
            role: currentRole
        });
    });

    socket.on('get-user-profile', (targetName) => {
        let foundProfile = null;
        for (let uid in usersDB) {
            if (usersDB[uid].nickname === targetName) {
                foundProfile = usersDB[uid];
                break;
            }
        }
        if (foundProfile) {
            socket.emit('receive-user-profile', foundProfile);
        }
    });

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
            
            for (let uid in usersDB) {
                if (usersDB[uid].nickname === targetName) {
                    bannedUsers.add(usersDB[uid].email.toLowerCase());
                    break;
                }
            }

            io.emit('system-message', `🚫 Потребителят ${targetName} получил ПОСТОЯНЕН БАН от клуба!`);
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
