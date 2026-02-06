require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, getDb } = require('./database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Запуск после инициализации БД
async function start() {
    // Инициализация базы данных
    await initDatabase();

    // Подключаем маршруты
    const authMiddleware = require('./middleware/auth');
    const authRoutes = require('./routes/auth');
    const citiesRoutes = require('./routes/cities');
    const ordersRoutes = require('./routes/orders');
    const mastersRoutes = require('./routes/masters');
    const sourcesRoutes = require('./routes/sources');
    const statusesRoutes = require('./routes/statuses');
    const statsRoutes = require('./routes/stats');

    // Публичные маршруты
    app.use('/api/auth', authRoutes);

    // Защищённые маршруты
    app.use('/api/cities', authMiddleware, citiesRoutes);
    app.use('/api/orders', authMiddleware, ordersRoutes);
    app.use('/api/masters', authMiddleware, mastersRoutes);
    app.use('/api/sources', authMiddleware, sourcesRoutes);
    app.use('/api/statuses', authMiddleware, statusesRoutes);
    app.use('/api/stats', authMiddleware, statsRoutes);

    // Health check
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // SPA fallback - все остальные запросы отдаём index.html
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Обработка ошибок
    app.use((err, req, res, next) => {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
}

start().catch(console.error);
