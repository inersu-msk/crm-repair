const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Получить все города
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const cities = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM orders WHERE city_id = c.id) as order_count,
        (SELECT COUNT(*) FROM orders WHERE city_id = c.id AND status_id = 1) as new_count
      FROM cities c 
      ORDER BY sort_order, name
    `).all();
        res.json(cities);
    } catch (error) {
        console.error('Get cities error:', error);
        res.status(500).json({ error: 'Ошибка получения городов' });
    }
});

// Добавить город
router.post('/', (req, res) => {
    try {
        const db = getDb();
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Введите название города' });
        }

        const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM cities').get();
        const sortOrder = (maxOrder.max || 0) + 1;

        const result = db.prepare('INSERT INTO cities (name, sort_order) VALUES (?, ?)').run(name.trim(), sortOrder);

        const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(result.lastInsertRowid);
        res.json(city);
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Такой город уже существует' });
        }
        console.error('Add city error:', error);
        res.status(500).json({ error: 'Ошибка добавления города' });
    }
});

// Обновить город
router.put('/:id', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { name, sort_order } = req.body;

        const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
        if (!city) {
            return res.status(404).json({ error: 'Город не найден' });
        }

        if (name !== undefined) {
            db.prepare('UPDATE cities SET name = ? WHERE id = ?').run(name.trim(), id);
        }
        if (sort_order !== undefined) {
            db.prepare('UPDATE cities SET sort_order = ? WHERE id = ?').run(sort_order, id);
        }

        const updatedCity = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
        res.json(updatedCity);
    } catch (error) {
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Такой город уже существует' });
        }
        console.error('Update city error:', error);
        res.status(500).json({ error: 'Ошибка обновления города' });
    }
});

// Удалить город
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(id);
        if (!city) {
            return res.status(404).json({ error: 'Город не найден' });
        }

        // Проверяем есть ли заказы
        const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE city_id = ?').get(id);
        if (orderCount.count > 0) {
            return res.status(400).json({
                error: `Нельзя удалить город с заказами (${orderCount.count} шт.)`
            });
        }

        db.prepare('DELETE FROM cities WHERE id = ?').run(id);
        res.json({ message: 'Город удалён' });
    } catch (error) {
        console.error('Delete city error:', error);
        res.status(500).json({ error: 'Ошибка удаления города' });
    }
});

module.exports = router;
