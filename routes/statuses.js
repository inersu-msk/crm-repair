const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Получить все статусы
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const statuses = db.prepare('SELECT * FROM statuses ORDER BY sort_order').all();
        res.json(statuses);
    } catch (error) {
        console.error('Get statuses error:', error);
        res.status(500).json({ error: 'Ошибка получения статусов' });
    }
});

module.exports = router;
