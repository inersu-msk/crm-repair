const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let sqlDb = null;
const dbPath = process.env.DATABASE_PATH || './data/crm.db';

// Сохранение базы данных на диск
function saveDatabase() {
  if (sqlDb) {
    try {
      const data = sqlDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.error('Error saving database:', e);
    }
  }
}

// Автосохранение каждые 30 секунд
setInterval(saveDatabase, 30000);

// Сохранение при выходе
process.on('exit', saveDatabase);
process.on('SIGINT', () => { saveDatabase(); process.exit(); });
process.on('SIGTERM', () => { saveDatabase(); process.exit(); });

// Обёртка для совместимости с better-sqlite3 API
class DatabaseWrapper {
  constructor(database) {
    this.db = database;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        try {
          self.db.run(sql, params);
          const lastId = self.db.exec("SELECT last_insert_rowid() as id");
          const changes = self.db.getRowsModified();
          saveDatabase();
          return {
            lastInsertRowid: lastId[0]?.values[0]?.[0] || 0,
            changes: changes
          };
        } catch (e) {
          console.error('DB run error:', e, 'SQL:', sql, 'Params:', params);
          throw e;
        }
      },
      get(...params) {
        try {
          const stmt = self.db.prepare(sql);
          if (params.length > 0) {
            stmt.bind(params);
          }
          let result = undefined;
          if (stmt.step()) {
            result = stmt.getAsObject();
          }
          stmt.free();
          return result;
        } catch (e) {
          console.error('DB get error:', e, 'SQL:', sql, 'Params:', params);
          throw e;
        }
      },
      all(...params) {
        try {
          const results = [];
          const stmt = self.db.prepare(sql);
          if (params.length > 0) {
            stmt.bind(params);
          }
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (e) {
          console.error('DB all error:', e, 'SQL:', sql, 'Params:', params);
          throw e;
        }
      }
    };
  }

  exec(sql) {
    try {
      this.db.run(sql);
      saveDatabase();
    } catch (e) {
      console.error('DB exec error:', e, 'SQL:', sql);
      throw e;
    }
  }

  pragma(pragma) {
    // sql.js не поддерживает pragma таким же образом
  }
}

// Инициализация базы данных
async function initDatabase() {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(fileBuffer);
    db = new DatabaseWrapper(sqlDb);
    console.log('✅ База данных загружена');
  } else {
    sqlDb = new SQL.Database();
    db = new DatabaseWrapper(sqlDb);
    console.log('✅ Создана новая база данных');
  }

  // Создание таблиц
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // Добавляем статусы если их нет
  const statusCount = db.prepare('SELECT COUNT(*) as count FROM statuses').get();
  if (statusCount.count === 0) {
    db.exec("INSERT INTO statuses (name, color, sort_order) VALUES ('Новый', '#3b82f6', 1)");
    db.exec("INSERT INTO statuses (name, color, sort_order) VALUES ('На созвоне', '#8b5cf6', 2)");
    db.exec("INSERT INTO statuses (name, color, sort_order) VALUES ('Ожидает мастера', '#eab308', 3)");
    db.exec("INSERT INTO statuses (name, color, sort_order) VALUES ('В работе', '#f97316', 4)");
    db.exec("INSERT INTO statuses (name, color, sort_order) VALUES ('Перенесён', '#6b7280', 5)");
    db.exec("INSERT INTO statuses (name, color, sort_order) VALUES ('Завершён', '#10b981', 6)");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const sourceCount = db.prepare('SELECT COUNT(*) as count FROM sources').get();
  if (sourceCount.count === 0) {
    db.exec("INSERT INTO sources (name) VALUES ('Авито')");
    db.exec("INSERT INTO sources (name) VALUES ('Сайт (Владислав)')");
    db.exec("INSERT INTO sources (name) VALUES ('Сайт (Андрей)')");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS masters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_nick TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT,
      city_id INTEGER NOT NULL,
      status_id INTEGER NOT NULL DEFAULT 1,
      source_id INTEGER,
      master_id INTEGER,
      address TEXT,
      metro TEXT,
      problem TEXT,
      comment TEXT,
      phone TEXT,
      client_name TEXT,
      scheduled_time TEXT,
      amount REAL,
      my_share REAL,
      master_share REAL,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Миграция: добавляем колонку order_number если её нет
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN order_number TEXT`);
    console.log('✅ Добавлена колонка order_number');
  } catch (e) {
    // Колонка уже существует
  }

  // Миграция: добавляем колонку recording_url если её нет
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN recording_url TEXT`);
    console.log('✅ Добавлена колонка recording_url');
  } catch (e) {
    // Колонка уже существует
  }

  // Генерируем номера для заказов без номера
  const ordersWithoutNumber = db.prepare('SELECT id, created_at FROM orders WHERE order_number IS NULL ORDER BY created_at').all();
  if (ordersWithoutNumber.length > 0) {
    ordersWithoutNumber.forEach((order, index) => {
      const date = new Date(order.created_at);
      const year = String(date.getFullYear()).slice(-2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const num = String(index + 1).padStart(3, '0');
      const orderNumber = `${year}${month}-${num}`;
      db.prepare('UPDATE orders SET order_number = ? WHERE id = ?').run(orderNumber, order.id);
    });
    console.log(`✅ Сгенерированы номера для ${ordersWithoutNumber.length} заказов`);
  }

  saveDatabase();
  console.log('✅ База данных инициализирована');

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
