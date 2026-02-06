const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Общая статистика
router.get('/overview', (req, res) => {
  try {
    const db = getDb();

    // Статистика за сегодня
    const today = db.prepare(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(my_share), 0) as my_earnings
      FROM orders 
      WHERE closed_at IS NOT NULL 
        AND date(closed_at) = date('now')
    `).get();

    // Статистика за неделю
    const week = db.prepare(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(my_share), 0) as my_earnings
      FROM orders 
      WHERE closed_at IS NOT NULL 
        AND closed_at >= datetime('now', '-7 days')
    `).get();

    // Статистика за месяц
    const month = db.prepare(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(my_share), 0) as my_earnings
      FROM orders 
      WHERE closed_at IS NOT NULL 
        AND closed_at >= datetime('now', '-30 days')
    `).get();

    // Всего заработано
    const allTime = db.prepare(`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(amount), 0) as total,
        COALESCE(SUM(my_share), 0) as my_earnings,
        COALESCE(AVG(amount), 0) as avg_check
      FROM orders 
      WHERE closed_at IS NOT NULL
    `).get();

    // Активные заказы
    const active = db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE closed_at IS NULL
    `).get();

    res.json({
      today,
      week,
      month,
      allTime,
      activeOrders: active.count
    });
  } catch (error) {
    console.error('Get overview stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// Статистика по мастерам
router.get('/masters', (req, res) => {
  try {
    const db = getDb();
    const { period } = req.query; // day, week, month, all

    let dateFilter = '';
    if (period === 'day') {
      dateFilter = "AND date(o.closed_at) = date('now')";
    } else if (period === 'week') {
      dateFilter = "AND o.closed_at >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      dateFilter = "AND o.closed_at >= datetime('now', '-30 days')";
    }

    const masters = db.prepare(`
      SELECT 
        m.id,
        m.telegram_nick,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.amount), 0) as total_amount,
        COALESCE(SUM(o.master_share), 0) as total_earned,
        COALESCE(AVG(o.amount), 0) as avg_check
      FROM masters m
      LEFT JOIN orders o ON o.master_id = m.id AND o.closed_at IS NOT NULL ${dateFilter}
      GROUP BY m.id
      HAVING orders_count > 0
      ORDER BY total_amount DESC
    `).all();

    res.json(masters);
  } catch (error) {
    console.error('Get masters stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики мастеров' });
  }
});

// Статистика по источникам
router.get('/sources', (req, res) => {
  try {
    const db = getDb();
    const { period } = req.query;

    let dateFilter = '';
    if (period === 'day') {
      dateFilter = "AND date(o.closed_at) = date('now')";
    } else if (period === 'week') {
      dateFilter = "AND o.closed_at >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      dateFilter = "AND o.closed_at >= datetime('now', '-30 days')";
    }

    const sources = db.prepare(`
      SELECT 
        s.id,
        s.name,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.amount), 0) as total_amount,
        COALESCE(AVG(o.amount), 0) as avg_check
      FROM sources s
      LEFT JOIN orders o ON o.source_id = s.id AND o.closed_at IS NOT NULL ${dateFilter}
      GROUP BY s.id
      ORDER BY orders_count DESC
    `).all();

    res.json(sources);
  } catch (error) {
    console.error('Get sources stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики источников' });
  }
});

// Статистика по городам
router.get('/cities', (req, res) => {
  try {
    const db = getDb();
    const { period } = req.query;

    let dateFilter = '';
    if (period === 'day') {
      dateFilter = "AND date(o.closed_at) = date('now')";
    } else if (period === 'week') {
      dateFilter = "AND o.closed_at >= datetime('now', '-7 days')";
    } else if (period === 'month') {
      dateFilter = "AND o.closed_at >= datetime('now', '-30 days')";
    }

    const cities = db.prepare(`
      SELECT 
        c.id,
        c.name,
        COUNT(o.id) as orders_count,
        COALESCE(SUM(o.amount), 0) as total_amount,
        COALESCE(SUM(o.my_share), 0) as my_earnings
      FROM cities c
      LEFT JOIN orders o ON o.city_id = c.id AND o.closed_at IS NOT NULL ${dateFilter}
      GROUP BY c.id
      ORDER BY orders_count DESC
    `).all();

    res.json(cities);
  } catch (error) {
    console.error('Get cities stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики городов' });
  }
});

module.exports = router;
