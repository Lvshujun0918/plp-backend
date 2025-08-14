const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

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
    // 创建记录表
    db.run(`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      text TEXT,
      uploadTime TEXT NOT NULL,
      fileSize INTEGER,
      uploaderIP TEXT
    )`, (err) => {
      if (err) {
        console.error('创建记录表失败:', err.message);
      } else {
        console.log('记录表已准备就绪');
      }
    });

    // 创建评论表
    db.run(`CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      recordId TEXT NOT NULL,
      content TEXT NOT NULL,
      commenterIP TEXT,
      commentTime TEXT NOT NULL,
      FOREIGN KEY (recordId) REFERENCES records (id)
    )`, (err) => {
      if (err) {
        console.error('创建评论表失败:', err.message);
      } else {
        console.log('评论表已准备就绪');
      }
    });
  });
}

// 生成唯一ID
function generateUniqueId() {
  // 使用crypto.randomBytes生成更可靠的唯一ID
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  const uniqueId = `${timestamp}-${randomPart}`;
  return uniqueId;
}

// 保存记录
function saveRecord(record) {
  return new Promise((resolve, reject) => {
    // 为记录生成唯一ID
    const uniqueId = generateUniqueId();
    
    const sql = `INSERT INTO records(id, filename, text, uploadTime, fileSize, uploaderIP)
                 VALUES(?, ?, ?, ?, ?, ?)`;
    const params = [
      uniqueId,
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
          id: uniqueId,
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

// 添加评论
function addComment(recordId, comment) {
  return new Promise((resolve, reject) => {
    // 检查记录是否存在
    const checkSql = `SELECT id FROM records WHERE id = ?`;
    db.get(checkSql, [recordId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        reject(new Error('指定的记录不存在'));
        return;
      }

      // 为评论生成唯一ID
      const commentId = generateUniqueId();
      
      const sql = `INSERT INTO comments(id, recordId, content, commenterIP, commentTime)
                   VALUES(?, ?, ?, ?, ?)`;
      const params = [
        commentId,
        recordId,
        comment.content,
        comment.commenterIP,
        comment.commentTime
      ];

      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: commentId,
            recordId: recordId,
            content: comment.content,
            commenterIP: comment.commenterIP,
            commentTime: comment.commentTime
          });
        }
      });
    });
  });
}

// 获取指定记录的所有评论
function getCommentsByRecordId(recordId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, recordId, content, commenterIP, commentTime 
                 FROM comments 
                 WHERE recordId = ? 
                 ORDER BY commentTime ASC`;

    db.all(sql, [recordId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
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
  addComment,
  getCommentsByRecordId,
  closeDatabase
};