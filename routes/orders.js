const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Получить заказы по городу (для канбана)
router.get('/city/:cityId', (req, res) => {
    try {
        const db = getDb();
        const { cityId } = req.params;

        const orders = db.prepare(`
      SELECT o.*, 
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.city_id = ?
      ORDER BY o.created_at DESC
    `).all(cityId);

        res.json(orders);
    } catch (error) {
        console.error('Get orders by city error:', error);
        res.status(500).json({ error: 'Ошибка получения заказов' });
    }
});

// Поиск заказов по телефону (для истории)
router.get('/by-phone/:phone', (req, res) => {
    try {
        const db = getDb();
        const { phone } = req.params;

        if (!phone || phone.length < 5) {
            return res.json([]);
        }

        const orders = db.prepare(`
      SELECT o.*, 
        c.name as city_name,
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN cities c ON c.id = o.city_id
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.phone = ?
      ORDER BY o.created_at DESC
      LIMIT 10
    `).all(phone);

        res.json(orders);
    } catch (error) {
        console.error('Get orders by phone error:', error);
        res.status(500).json({ error: 'Ошибка получения истории' });
    }
});

// Поиск заказов
router.get('/search', (req, res) => {
    try {
        const db = getDb();
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json([]);
        }

        const searchTerm = `%${q}%`;
        const orders = db.prepare(`
      SELECT o.*, 
        c.name as city_name,
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN cities c ON c.id = o.city_id
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.address LIKE ? 
        OR o.metro LIKE ?
        OR o.phone LIKE ?
        OR o.client_name LIKE ?
        OR o.problem LIKE ?
        OR m.telegram_nick LIKE ?
      ORDER BY o.created_at DESC
      LIMIT 50
    `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);

        res.json(orders);
    } catch (error) {
        console.error('Search orders error:', error);
        res.status(500).json({ error: 'Ошибка поиска' });
    }
});

// Получить один заказ
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const order = db.prepare(`
      SELECT o.*, 
        c.name as city_name,
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN cities c ON c.id = o.city_id
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.id = ?
    `).get(id);

        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        res.json(order);
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Ошибка получения заказа' });
    }
});

// Создать заказ
router.post('/', (req, res) => {
    try {
        const db = getDb();
        const {
            city_id, source_id, master_nick,
            address, metro, problem, comment,
            phone, client_name, scheduled_time,
            recording_url
        } = req.body;

        // Валидация телефона
        if (phone && phone.trim()) {
            const phoneRegex = /^\+7\d{10}$/;
            if (!phoneRegex.test(phone.trim())) {
                return res.status(400).json({ error: 'Телефон должен быть в формате +7XXXXXXXXXX' });
            }
        }

        if (!city_id) {
            return res.status(400).json({ error: 'Выберите город' });
        }

        // Если указан мастер - найти или создать
        let master_id = null;
        if (master_nick && master_nick.trim()) {
            let master = db.prepare('SELECT id FROM masters WHERE telegram_nick = ?').get(master_nick.trim());
            if (!master) {
                const result = db.prepare('INSERT INTO masters (telegram_nick) VALUES (?)').run(master_nick.trim());
                master_id = result.lastInsertRowid;
            } else {
                master_id = master.id;
            }
        }

        // Генерируем номер заказа
        const now = new Date();
        const year = String(now.getFullYear()).slice(-2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `${year}${month}-`;

        // Находим максимальный номер за этот месяц
        const lastOrder = db.prepare(
            `SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1`
        ).get(`${prefix}%`);

        let nextNum = 1;
        if (lastOrder && lastOrder.order_number) {
            const parts = lastOrder.order_number.split('-');
            if (parts.length === 2) {
                nextNum = parseInt(parts[1], 10) + 1;
            }
        }
        const orderNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;

        const result = db.prepare(`
      INSERT INTO orders (
        order_number, city_id, status_id, source_id, master_id,
        address, metro, problem, comment,
        phone, client_name, scheduled_time, recording_url
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            orderNumber, city_id, source_id || null, master_id,
            address || null, metro || null, problem || null, comment || null,
            phone || null, client_name || null, scheduled_time || null,
            recording_url || null
        );

        const order = db.prepare(`
      SELECT o.*, 
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.id = ?
    `).get(result.lastInsertRowid);

        res.json(order);
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Ошибка создания заказа' });
    }
});

// Обновить заказ
router.put('/:id', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const {
            source_id, master_nick,
            address, metro, problem, comment,
            phone, client_name, scheduled_time,
            recording_url
        } = req.body;

        // Валидация телефона
        if (phone && phone.trim()) {
            const phoneRegex = /^\+7\d{10}$/;
            if (!phoneRegex.test(phone.trim())) {
                return res.status(400).json({ error: 'Телефон должен быть в формате +7XXXXXXXXXX' });
            }
        }

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        // Если указан мастер - найти или создать
        let master_id = order.master_id;
        if (master_nick !== undefined) {
            if (master_nick && master_nick.trim()) {
                let master = db.prepare('SELECT id FROM masters WHERE telegram_nick = ?').get(master_nick.trim());
                if (!master) {
                    const result = db.prepare('INSERT INTO masters (telegram_nick) VALUES (?)').run(master_nick.trim());
                    master_id = result.lastInsertRowid;
                } else {
                    master_id = master.id;
                }
            } else {
                master_id = null;
            }
        }

        db.prepare(`
      UPDATE orders SET
        source_id = ?,
        master_id = ?,
        address = ?,
        metro = ?,
        problem = ?,
        comment = ?,
        phone = ?,
        client_name = ?,
        scheduled_time = ?,
        recording_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
            source_id !== undefined ? source_id : order.source_id,
            master_id,
            address !== undefined ? address : order.address,
            metro !== undefined ? metro : order.metro,
            problem !== undefined ? problem : order.problem,
            comment !== undefined ? comment : order.comment,
            phone !== undefined ? phone : order.phone,
            client_name !== undefined ? client_name : order.client_name,
            scheduled_time !== undefined ? scheduled_time : order.scheduled_time,
            recording_url !== undefined ? recording_url : order.recording_url,
            id
        );

        const updatedOrder = db.prepare(`
      SELECT o.*, 
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.id = ?
    `).get(id);

        res.json(updatedOrder);
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Ошибка обновления заказа' });
    }
});

// Изменить статус (drag-and-drop)
router.put('/:id/status', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { status_id, master_nick } = req.body;

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        const status = db.prepare('SELECT * FROM statuses WHERE id = ?').get(status_id);
        if (!status) {
            return res.status(400).json({ error: 'Статус не найден' });
        }

        // Если статус "В работе" - требуем мастера
        const inWorkStatus = db.prepare(`SELECT * FROM statuses WHERE name = 'В работе'`).get();
        if (inWorkStatus && status_id === inWorkStatus.id && !order.master_id && !master_nick) {
            return res.status(400).json({
                error: 'Укажите мастера для перевода в работу',
                requireMaster: true,
                orderId: id,
                statusId: status_id
            });
        }

        // Если указан мастер - найти или создать
        let master_id = order.master_id;
        if (master_nick && master_nick.trim()) {
            let master = db.prepare('SELECT id FROM masters WHERE telegram_nick = ?').get(master_nick.trim());
            if (!master) {
                const result = db.prepare('INSERT INTO masters (telegram_nick) VALUES (?)').run(master_nick.trim());
                master_id = result.lastInsertRowid;
            } else {
                master_id = master.id;
            }
            // Обновляем мастера в заказе
            db.prepare(`UPDATE orders SET master_id = ? WHERE id = ?`).run(master_id, id);
        }

        db.prepare(`
      UPDATE orders SET status_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status_id, id);

        const updatedOrder = db.prepare(`
      SELECT o.*, 
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.id = ?
    `).get(id);

        res.json(updatedOrder);
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Ошибка обновления статуса' });
    }
});

// Закрыть заказ (указать сумму)
router.put('/:id/close', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { amount } = req.body;

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        if (amount === undefined || amount === null || amount < 0) {
            return res.status(400).json({ error: 'Укажите сумму заказа' });
        }

        // Статус "Завершён" - id 6
        const completedStatusId = 6;

        // Расчёт 50/50
        const myShare = amount / 2;
        const masterShare = amount / 2;

        db.prepare(`
      UPDATE orders SET 
        status_id = ?,
        amount = ?,
        my_share = ?,
        master_share = ?,
        closed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(completedStatusId, amount, myShare, masterShare, id);

        const updatedOrder = db.prepare(`
      SELECT o.*, 
        s.name as status_name, 
        s.color as status_color,
        src.name as source_name,
        m.telegram_nick as master_nick
      FROM orders o
      LEFT JOIN statuses s ON s.id = o.status_id
      LEFT JOIN sources src ON src.id = o.source_id
      LEFT JOIN masters m ON m.id = o.master_id
      WHERE o.id = ?
    `).get(id);

        res.json(updatedOrder);
    } catch (error) {
        console.error('Close order error:', error);
        res.status(500).json({ error: 'Ошибка закрытия заказа' });
    }
});

// Удалить заказ
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }

        db.prepare('DELETE FROM orders WHERE id = ?').run(id);
        res.json({ message: 'Заказ удалён' });
    } catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({ error: 'Ошибка удаления заказа' });
    }
});

module.exports = router;
