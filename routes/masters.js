const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Получить всех мастеров (для автодополнения)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const masters = db.prepare(`
      SELECT m.*, 
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.master_share), 0) as total_earned,
        COALESCE(AVG(o.amount), 0) as avg_check
      FROM masters m
      LEFT JOIN orders o ON o.master_id = m.id AND o.closed_at IS NOT NULL
      GROUP BY m.id
      ORDER BY m.telegram_nick
    `).all();
        res.json(masters);
    } catch (error) {
        console.error('Get masters error:', error);
        res.status(500).json({ error: 'Ошибка получения мастеров' });
    }
});

// Получить или создать мастера по нику
router.post('/find-or-create', (req, res) => {
    try {
        const db = getDb();
        const { telegram_nick } = req.body;

        if (!telegram_nick || !telegram_nick.trim()) {
            return res.status(400).json({ error: 'Введите ник мастера' });
        }

        const nick = telegram_nick.trim();

        let master = db.prepare('SELECT * FROM masters WHERE telegram_nick = ?').get(nick);

        if (!master) {
            const result = db.prepare('INSERT INTO masters (telegram_nick) VALUES (?)').run(nick);
            master = db.prepare('SELECT * FROM masters WHERE id = ?').get(result.lastInsertRowid);
        }

        res.json(master);
    } catch (error) {
        console.error('Find or create master error:', error);
        res.status(500).json({ error: 'Ошибка' });
    }
});

// Статистика мастера
router.get('/:id/stats', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const master = db.prepare('SELECT * FROM masters WHERE id = ?').get(id);
        if (!master) {
            return res.status(404).json({ error: 'Мастер не найден' });
        }

        // Общая статистика
        const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(master_share), 0) as total_earned,
        COALESCE(AVG(amount), 0) as avg_check
      FROM orders 
      WHERE master_id = ? AND closed_at IS NOT NULL
    `).get(id);

        // Статистика за последний месяц
        const monthStats = db.prepare(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as amount,
        COALESCE(SUM(master_share), 0) as earned
      FROM orders 
      WHERE master_id = ? 
        AND closed_at IS NOT NULL 
        AND closed_at >= datetime('now', '-30 days')
    `).get(id);

        res.json({
            master,
            stats,
            monthStats
        });
    } catch (error) {
        console.error('Get master stats error:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

module.exports = router;
