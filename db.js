const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'database.sqlite');

// 创建数据库连接
let db;

// 初始化数据库
function initializeDatabase() {
  // 创建数据库连接
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('数据库连接失败:', err.message);
    } else {
      console.log('已连接到SQLite数据库');
    }
  });

  // 创建表
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      text TEXT,
      uploadTime TEXT NOT NULL,
      fileSize INTEGER,
      uploaderIP TEXT
    )`, (err) => {
      if (err) {
        console.error('创建表失败:', err.message);
      } else {
        console.log('数据库表已准备就绪');
      }
    });
  });
}

// 保存记录
function saveRecord(record) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO records(id, filename, text, uploadTime, fileSize, uploaderIP)
                 VALUES(?, ?, ?, ?, ?, ?)`;
    const params = [
      record.id,
      record.filename,
      record.text,
      record.uploadTime,
      record.fileSize,
      record.uploaderIP
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          id: record.id,
          filename: record.filename,
          text: record.text,
          uploadTime: record.uploadTime,
          fileSize: record.fileSize,
          uploaderIP: record.uploaderIP
        });
      }
    });
  });
}

// 获取所有记录
function getAllRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, filename, text, uploadTime, fileSize, uploaderIP FROM records`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 获取随机记录
function getRandomRecord() {
  return new Promise((resolve, reject) => {
    // 先获取记录总数
    db.get(`SELECT COUNT(*) as count FROM records`, [], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      const count = row.count;
      if (count === 0) {
        resolve(null);
        return;
      }

      // 生成随机偏移量
      const randomOffset = Math.floor(Math.random() * count);

      // 获取随机记录
      const sql = `SELECT id, filename, text, uploadTime, fileSize, uploaderIP 
                   FROM records LIMIT 1 OFFSET ?`;
      
      db.get(sql, [randomOffset], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  });
}

// 关闭数据库连接
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('关闭数据库连接时出错:', err.message);
      } else {
        console.log('数据库连接已关闭');
      }
    });
  }
}

module.exports = {
  initializeDatabase,
  saveRecord,
  getAllRecords,
  getRandomRecord,
  closeDatabase
};