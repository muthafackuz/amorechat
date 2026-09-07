const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const admin = require('firebase-admin');

// 🔐 Твоите лични ключове от Firebase (Вече конфигурирани за теб)
const firebaseConfig = {
  apiKey: "AIzaSyAECHxZNoWBbpx-eg1HvAGOfuOLSI4j4ho",
  authDomain: "://firebaseapp.com",
  projectId: "amorechat-77ecf",
  storageBucket: "amorechat-77ecf.firebasestorage.app",
  messagingSenderId: "830014963598",
  appId: "1:830014963598:web:6117bdb8f952bb7cccaedf"
};

// Инициализиране на Firebase Admin за Node.js
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: firebaseConfig.projectId
  })
});
const db = admin.firestore();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Списъци в паметта за активни модерации
const mutedUsers = new Set();
const bannedUsers = new Set();
const onlineSockets = {};

io.on('connection', (socket) => {
    let userEmail = "";
    let userNickname = "";
    let userRole = "user";

    // Логика за влизане и регистрация
    socket.on('authenticate', async (data) => {
        const { email, password, nickname, age, gender, info, avatar, isRegister } = data;

        if (bannedUsers.has(email.toLowerCase())) {
            return socket.emit('auth-error', '🚫 Този акаунт има постоянен БАН!');
        }

        try {
            if (isRegister) {
                // 1. Създаване на нов потребител във Firebase Auth
                const userRecord = await admin.auth().createUser({
                    email: email,
                    password: password,
                    displayName: nickname
                });

                // Определяне на роля - ако се регистрираш с ник Admin или този имейл, ставаш автоматично шеф
                const role = (email.toLowerCase() === 'admin@amoreclub.net' || nickname.toLowerCase() === 'admin') ? 'admin' : 'user';

                // 2. Записване на профила в Firestore базата данни
                const profileData = {
                    uid: userRecord.uid,
                    email: email.toLowerCase(),
                    nickname: nickname,
                    age: age || "Не е посочено",
                    gender: gender || "Тайна",
                    info: info || "Няма информация.",
                    avatar: avatar || 'https://dicebear.com' + nickname,
                    role: role
                };

                await db.collection('users').doc(userRecord.uid).set(profileData);
                
                userNickname = nickname;
                userEmail = email.toLowerCase();
                userRole = role;
                onlineSockets[userNickname] = socket;

                socket.emit('auth-success', profileData);
                io.emit('system-message', `🎉 Нов член се регистрира: ${userNickname}!`);
            } else {
                // Вход: Търсим потребителя по имейл в Firestore таблицата
                const snapshot = await db.collection('users').where('email', '==', email.toLowerCase()).get();
                if (snapshot.empty) {
                    return socket.emit('auth-error', 'Потребителят не е намерен! Проверете имейла или направете Регистрация.');
                }
                
                const userData = snapshot.docs.data();
                userNickname = userData.nickname;
                userEmail = userData.email;
                userRole = userData.role;

                if (bannedUsers.has(userEmail)) {
                    return socket.emit('auth-error', '🚫 Имате постоянен БАН от този чат!');
                }

                onlineSockets[userNickname] = socket;
                socket.emit('auth-success', userData);
                io.emit('system-message', `✨ ${userNickname} влезе в стаята.`);
            }
        } catch (error) {
            socket.emit('auth-error', 'Грешка: ' + error.message);
        }
    });

    // Изпращане на съобщение
    socket.on('chat-message', (msg) => {
        if (!userNickname) return;
        if (mutedUsers.has(userNickname)) {
            return socket.emit('system-message', '🔇 Вие сте заглушен от Администратора и не можете да пишете!');
        }

        io.emit('broadcast-message', {
            user: userNickname,
            text: msg,
            role: userRole
        });
    });

    // 👑 АДМИН ПАНЕЛ (Kick, Mute, Ban)
    socket.on('admin-action', (data) => {
        if (userRole !== 'admin') return; 
        const { action, targetName } = data;
        const targetSocket = onlineSockets[targetName];

        if (action === 'kick') {
            io.emit('system-message', `🚨 Потребителят ${targetName} беше изгонен от Администратора.`);
            if (targetSocket) targetSocket.emit('kick-user');
        } 
        else if (action === 'mute') {
            mutedUsers.add(targetName);
            io.emit('system-message', `🔇 Потребителят ${targetName} беше заглушен.`);
        } 
        else if (action === 'ban') {
            bannedUsers.add(targetName);
            io.emit('system-message', `🚫 Потребителят ${targetName} получил постоянен БАН!`);
            if (targetSocket) targetSocket.emit('kick-user');
        }
    });

    socket.on('disconnect', () => {
        if (userNickname) {
            delete onlineSockets[userNickname];
            io.emit('system-message', `👋 ${userNickname} напусна чата.`);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Premium Chat running on port ${PORT}`);
});
