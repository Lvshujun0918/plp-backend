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
    // 创建记录表（添加status字段，默认为'pending'）
    db.run(`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      text TEXT,
      uploadTime TEXT NOT NULL,
      fileSize INTEGER,
      uploaderIP TEXT,
      status TEXT DEFAULT 'pending'
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

    // 创建秘钥表
    db.run(`CREATE TABLE IF NOT EXISTS keys (
      key TEXT PRIMARY KEY,
      ip TEXT NOT NULL,
      userAgent TEXT NOT NULL,
      createDate TEXT NOT NULL,
      used INTEGER DEFAULT 0
    )`, (err) => {
      if (err) {
        console.error('创建秘钥表失败:', err.message);
      } else {
        console.log('秘钥表已准备就绪');
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

// 生成秘钥
function generateKey(ip, userAgent) {
  // 获取当前日期（年-月-日）
  const today = new Date().toISOString().split('T')[0];
  // 使用IP、User-Agent和日期生成哈希
  const hash = crypto.createHash('sha256');
  hash.update(ip + userAgent + today);
  return hash.digest('hex');
}

// 保存秘钥
function saveKey(key, ip, userAgent) {
  return new Promise((resolve, reject) => {
    const sql = `INSERT OR REPLACE INTO keys(key, ip, userAgent, createDate)
                 VALUES(?, ?, ?, ?)`;
    const params = [
      key,
      ip,
      userAgent,
      new Date().toISOString().split('T')[0] // 只保存日期部分
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          key: key,
          ip: ip,
          userAgent: userAgent,
          createDate: new Date().toISOString().split('T')[0]
        });
      }
    });
  });
}

// 验证秘钥
function validateKey(key, ip, userAgent) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM keys WHERE key = ? AND ip = ? AND userAgent = ? AND used = 0`;
    const params = [key, ip, userAgent];

    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        // 检查秘钥是否存在且未使用
        if (row) {
          // 检查秘钥是否在今天生成
          const today = new Date().toISOString().split('T')[0];
          if (row.createDate === today) {
            resolve(true);
          } else {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      }
    });
  });
}

// 标记秘钥为已使用
function markKeyAsUsed(key) {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE keys SET used = 1 WHERE key = ?`;
    const params = [key];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0); // 返回是否更新了记录
      }
    });
  });
}

// 检查IP在今天是否已上传
function checkUploadLimit(ip) {
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `SELECT COUNT(*) as count FROM records WHERE uploaderIP = ? AND date(uploadTime) = ?`;
    const params = [ip, today];

    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count > 0); // 如果今天已上传过，返回true
      }
    });
  });
}

// 保存记录
function saveRecord(record) {
  return new Promise((resolve, reject) => {
    // 为记录生成唯一ID
    const uniqueId = generateUniqueId();
    
    const sql = `INSERT INTO records(id, filename, text, uploadTime, fileSize, uploaderIP, status)
                 VALUES(?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      uniqueId,
      record.filename,
      record.text,
      record.uploadTime,
      record.fileSize,
      record.uploaderIP,
      'pending' // 默认状态为待审核
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
          uploaderIP: record.uploaderIP,
          status: 'pending'
        });
      }
    });
  });
}

// 获取所有记录
function getAllRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, filename, text, uploadTime, fileSize, uploaderIP, status FROM records`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 获取所有待审核记录
function getPendingRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, filename, text, uploadTime, fileSize, uploaderIP, status FROM records WHERE status = 'pending'`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 审核记录
function reviewRecord(id, status) {
  return new Promise((resolve, reject) => {
    // 检查状态是否有效
    if (!['approved', 'rejected'].includes(status)) {
      reject(new Error('无效的审核状态'));
      return;
    }

    const sql = `UPDATE records SET status = ? WHERE id = ?`;
    const params = [status, id];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        if (this.changes === 0) {
          reject(new Error('记录不存在'));
        } else {
          resolve({ id, status });
        }
      }
    });
  });
}

// 获取随机记录（仅获取已审核通过的记录）
function getRandomRecord() {
  return new Promise((resolve, reject) => {
    // 先获取记录总数
    db.get(`SELECT COUNT(*) as count FROM records WHERE status = 'approved'`, [], (err, row) => {
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
      const sql = `SELECT id, filename, text, uploadTime, fileSize, uploaderIP, status
                   FROM records WHERE status = 'approved' LIMIT 1 OFFSET ?`;
      
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

// 获取已审核通过的记录
function getApprovedRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, filename, text, uploadTime, fileSize, uploaderIP, status FROM records WHERE status = 'approved'`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 添加评论
function addComment(recordId, comment) {
  return new Promise((resolve, reject) => {
    // 检查记录是否存在且已审核通过
    const checkSql = `SELECT id FROM records WHERE id = ? AND status = 'approved'`;
    db.get(checkSql, [recordId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!row) {
        reject(new Error('指定的记录不存在或未审核通过'));
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
  generateKey,
  saveKey,
  validateKey,
  markKeyAsUsed,
  checkUploadLimit,
  saveRecord,
  getAllRecords,
  getPendingRecords,
  reviewRecord,
  getRandomRecord,
  getApprovedRecords,
  addComment,
  getCommentsByRecordId,
  closeDatabase
};