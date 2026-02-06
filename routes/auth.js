const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');

const router = express.Router();

// Middleware для проверки авторизации
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }
};

// Регистрация (только если нет пользователей)
router.post('/register', async (req, res) => {
    try {
        const db = getDb();
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Пароль должен быть минимум 4 символа' });
        }

        // Проверяем есть ли уже пользователи
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
        if (userCount.count > 0) {
            return res.status(403).json({ error: 'Регистрация закрыта' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);

        const token = jwt.sign(
            { userId: result.lastInsertRowid, username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Регистрация успешна',
            token,
            user: { id: result.lastInsertRowid, username }
        });
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Такой пользователь уже существует' });
        }
        console.error('Register error:', error);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

// Авторизация
router.post('/login', async (req, res) => {
    try {
        const db = getDb();
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Авторизация успешна',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка авторизации' });
    }
});

// Проверка токена
router.get('/me', (req, res) => {
    const db = getDb();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        res.json({ user });
    } catch (error) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }
});

// Проверка нужна ли регистрация
router.get('/check', (req, res) => {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    res.json({ needsRegistration: userCount.count === 0 });
});

// Получение списка пользователей
router.get('/users', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY created_at DESC').all();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
});

// Создание пользователя (из админки)
router.post('/users', authMiddleware, async (req, res) => {
    try {
        const db = getDb();
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Пароль должен быть минимум 4 символа' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        try {
            const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
            res.json({ id: result.lastInsertRowid, username });
        } catch (e) {
            if (e.message && e.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Пользователь уже существует' });
            }
            throw e;
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка создания пользователя' });
    }
});

// Удаление пользователя
router.delete('/users/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        // Не даем удалить самого себя
        if (parseInt(id) === req.user.userId) {
            return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ message: 'Пользователь удален' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
});

// Смена пароля (для себя)
router.put('/password', authMiddleware, async (req, res) => {
    try {
        const db = getDb();
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.userId;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Новый пароль должен быть минимум 4 символа' });
        }

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный текущий пароль' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

        res.json({ message: 'Пароль успешно изменен' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка смены пароля' });
    }
});

module.exports = router;
