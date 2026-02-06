const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Получить все источники
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const sources = db.prepare('SELECT * FROM sources ORDER BY name').all();
        res.json(sources);
    } catch (error) {
        console.error('Get sources error:', error);
        res.status(500).json({ error: 'Ошибка получения источников' });
    }
});

// Добавить источник
router.post('/', (req, res) => {
    try {
        const db = getDb();
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Введите название источника' });
        }

        const result = db.prepare('INSERT INTO sources (name) VALUES (?)').run(name.trim());

        const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(result.lastInsertRowid);
        res.json(source);
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Такой источник уже существует' });
        }
        console.error('Add source error:', error);
        res.status(500).json({ error: 'Ошибка добавления источника' });
    }
});

// Удалить источник
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
        if (!source) {
            return res.status(404).json({ error: 'Источник не найден' });
        }

        db.prepare('DELETE FROM sources WHERE id = ?').run(id);
        res.json({ message: 'Источник удалён' });
    } catch (error) {
        console.error('Delete source error:', error);
        res.status(500).json({ error: 'Ошибка удаления источника' });
    }
});

module.exports = router;
