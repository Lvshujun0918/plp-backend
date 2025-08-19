const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
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
    // 创建记录表（添加status字段，默认为'pending'，添加carrier字段，默认为0-可编辑，添加fantasy字段记录图片张数，添加title字段）
    db.run(`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      text TEXT,
      title TEXT,
      uploadTime TEXT NOT NULL,
      uploaderIP TEXT,
      status TEXT DEFAULT 'pending',
      carrier INTEGER DEFAULT 0,
      fantasy INTEGER DEFAULT 0  -- 记录图片张数
    )`, (err) => {
      if (err) {
        console.error('创建记录表失败:', err.message);
      } else {
        console.log('记录表已准备就绪');
      }
    });

    // 创建记录文件表用于存储多张图片文件名
    db.run(`CREATE TABLE IF NOT EXISTS record_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recordId TEXT NOT NULL,  -- 关联到记录表
      filename TEXT NOT NULL,  -- 图片文件名
      FOREIGN KEY (recordId) REFERENCES records (id)
    )`, (err) => {
      if (err) {
        console.error('创建记录文件表失败:', err.message);
      } else {
        console.log('记录文件表已准备就绪');
      }
    });

    // 创建评论表（添加status字段，默认为'pending'）
    db.run(`CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      recordId TEXT NOT NULL,
      content TEXT NOT NULL,
      commenterIP TEXT,
      commentTime TEXT NOT NULL,
      status TEXT DEFAULT 'pending',  -- 添加评论状态，默认为待审核
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

    // 创建管理员表
    db.run(`CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY,
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL
    )`, (err) => {
      if (err) {
        console.error('创建管理员表失败:', err.message);
      } else {
        console.log('管理员表已准备就绪');
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

// 设置管理员密码
function setAdminPassword(password) {
  return new Promise((resolve, reject) => {
    // 生成盐值
    const salt = crypto.randomBytes(16).toString('hex');
    
    // 使用盐值和密码生成哈希
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    
    // 保存到数据库
    const sql = `INSERT OR REPLACE INTO admin(id, passwordHash, salt) VALUES(1, ?, ?)`;
    const params = [hash, salt];
    
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// 验证管理员密码
function validateAdminPassword(password) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT passwordHash, salt FROM admin WHERE id = 1`;
    
    db.get(sql, [], (err, row) => {
      if (err) {
        reject(err);
      } else {
        if (!row) {
          // 如果没有设置管理员密码，默认验证失败
          resolve(false);
        } else {
          // 使用存储的盐值和提供的密码生成哈希
          const hash = crypto.pbkdf2Sync(password, row.salt, 10000, 64, 'sha512').toString('hex');
          
          // 比较哈希值
          resolve(hash === row.passwordHash);
        }
      }
    });
  });
}

// 检查管理员密码是否已设置
function isAdminPasswordSet() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT COUNT(*) as count FROM admin WHERE id = 1`;
    
    db.get(sql, [], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count > 0);
      }
    });
  });
}

// 保存记录
function saveRecord(record) {
  return new Promise((resolve, reject) => {
    // 为记录生成唯一ID
    const uniqueId = generateUniqueId();
    
    const sql = `INSERT INTO records(id, text, title, uploadTime, uploaderIP, status, carrier, fantasy)
                 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      uniqueId,
      record.text,
      record.title || '', // 添加title字段
      record.uploadTime,
      record.uploaderIP,
      'pending', // 默认状态为待审核
      record.carrier || 0, // 默认为可编辑
      record.fantasy || 0 // 默认图片张数为0
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        // 用于存储实际保存的文件名
        const savedFilenames = [];
        
        // 如果有多个文件，保存到record_files表
        if (record.files && record.files.length > 0) {
          record.files.forEach((file, index) => {
            const ext = path.extname(file.originalname);
            const timestamp = Date.now();
            const randomSuffix = Math.round(Math.random() * 1E9);
            const ipHash = crypto.createHash('md5').update(record.uploaderIP).digest('hex');
            const newFilename = ipHash + '-' + timestamp + '-' + randomSuffix + ext;
            
            // 保存文件名用于返回
            savedFilenames.push(newFilename);
            
            // 使用与server.js中相同的上传目录路径
            const uploadDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            // 保存文件
            const filePath = path.join(uploadDir, newFilename);
            fs.writeFileSync(filePath, file.buffer);
            
            // 插入文件记录
            const sql = `INSERT INTO record_files(recordId, filename) VALUES(?, ?)`;
            const params = [uniqueId, newFilename];
            
            db.run(sql, params, function(err) {
              if (err) {
                console.error('保存文件记录失败:', err.message);
              }
            });
          });
        }
        
        resolve({
          id: uniqueId,
          text: record.text,
          title: record.title || '', // 添加title字段
          uploadTime: record.uploadTime,
          uploaderIP: record.uploaderIP,
          status: 'pending',
          carrier: record.carrier || 0,
          fantasy: record.fantasy || 0,
          filenames: savedFilenames // 使用实际保存的文件名
        });
      }
    });
  });
}

// 获取所有记录
function getAllRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, text, title, uploadTime, uploaderIP, status, carrier, fantasy FROM records`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // 为每个记录获取所有文件名
        const promises = rows.map(row => {
          return getRecordFiles(row.id).then(filenames => {
            return {
              ...row,
              filenames: filenames // 添加所有文件名
            };
          });
        });
        
        Promise.all(promises).then(recordsWithFiles => {
          resolve(recordsWithFiles);
        }).catch(err => {
          reject(err);
        });
      }
    });
  });
}

// 获取所有待审核记录
function getPendingRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, text, title, uploadTime, uploaderIP, status, carrier, fantasy FROM records WHERE status = 'pending'`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // 为每个记录获取所有文件名
        const promises = rows.map(row => {
          return getRecordFiles(row.id).then(filenames => {
            return {
              ...row,
              filenames: filenames // 添加所有文件名
            };
          });
        });
        
        Promise.all(promises).then(recordsWithFiles => {
          resolve(recordsWithFiles);
        }).catch(err => {
          reject(err);
        });
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
      const sql = `SELECT id, text, title, uploadTime, uploaderIP, status, carrier, fantasy
                   FROM records WHERE status = 'approved' LIMIT 1 OFFSET ?`;
      
      db.get(sql, [randomOffset], (err, row) => {
        if (err) {
          reject(err);
        } else {
          // 获取记录的所有文件名
          getRecordFiles(row.id).then(filenames => {
            resolve({
              ...row,
              filenames: filenames // 添加所有文件名
            });
          }).catch(err => {
            reject(err);
          });
        }
      });
    });
  });
}

// 获取已审核通过的记录
function getApprovedRecords() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, text, title, uploadTime, uploaderIP, status, carrier, fantasy FROM records WHERE status = 'approved'`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // 为每个记录获取所有文件名
        const promises = rows.map(row => {
          return getRecordFiles(row.id).then(filenames => {
            return {
              ...row,
              filenames: filenames // 添加所有文件名
            };
          });
        });
        
        Promise.all(promises).then(recordsWithFiles => {
          resolve(recordsWithFiles);
        }).catch(err => {
          reject(err);
        });
      }
    });
  });
}

// 编辑记录（仅可编辑的记录）
function editRecord(id, updates, uploadDir, clientIP) {
  return new Promise((resolve, reject) => {
    // 首先检查记录是否存在且可编辑
    const checkSql = `SELECT id, carrier, fantasy FROM records WHERE id = ? AND carrier = 0 AND status = 'approved'`;
    db.get(checkSql, [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (!row) {
        reject(new Error('记录不存在、不可编辑或未审核通过'));
        return;
      }

      // 构建动态更新语句
      let updateFields = [];
      let params = [];
      
      if (updates.text !== undefined) {
        updateFields.push('text = ?');
        params.push(updates.text);
      }
      
      if (updates.title !== undefined) {
        updateFields.push('title = ?');
        params.push(updates.title);
      }
      
      // 重置审核状态为待审核
      updateFields.push('status = ?');
      params.push('pending');
      
      // 处理多图片上传
      if (updates.images && updates.images.length > 0) {
        // 删除旧的关联文件记录
        const deleteSql = `DELETE FROM record_files WHERE recordId = ?`;
        db.run(deleteSql, [id], (err) => {
          if (err) {
            console.error('删除旧关联文件记录失败:', err.message);
          }
        });
        
        // 确保上传目录存在
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // 更新图片张数
        updateFields.push('fantasy = ?');
        params.push(updates.images.length);
        
        // 保存其他图片
        const savedFilenames = []; // 用于存储实际保存的文件名
        updates.images.forEach((file, index) => {
          const ext = path.extname(file.originalname);
          const timestamp = Date.now();
          const randomSuffix = Math.round(Math.random() * 1E9);
          const ipHash = crypto.createHash('md5').update(clientIP).digest('hex');
          const newFilename = ipHash + '-' + timestamp + '-' + randomSuffix + ext;
          
          // 保存文件名用于返回
          savedFilenames.push(newFilename);
          
          // 使用与server.js中相同的上传目录路径
          const uploadDir = path.join(__dirname, 'uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          
          // 保存文件
          const filePath = path.join(uploadDir, newFilename);
          fs.writeFileSync(filePath, file.buffer);
          
          // 插入文件记录
          const sql = `INSERT INTO record_files(recordId, filename) VALUES(?, ?)`;
          const params = [id, newFilename];
          
          db.run(sql, params, function(err) {
            if (err) {
              console.error('保存文件记录失败:', err.message);
            }
          });
        });
      } else if (updates.fantasy !== undefined) {
        // 如果只更新fantasy字段
        updateFields.push('fantasy = ?');
        params.push(updates.fantasy);
      }
      
      // 如果没有任何更新字段，则直接返回
      if (updateFields.length === 0) {
        // 重新查询完整记录
        const selectSql = `SELECT id, text, title, uploadTime, uploaderIP, status, carrier, fantasy FROM records WHERE id = ?`;
        db.get(selectSql, [id], (err, row) => {
          if (err) {
            reject(err);
          } else {
            // 获取记录的所有文件名
            getRecordFiles(row.id).then(filenames => {
              resolve({
                ...row,
                filenames: filenames // 添加所有文件名
              });
            }).catch(err => {
              reject(err);
            });
          }
        });
        return;
      }
      
      // 添加记录ID到参数列表
      params.push(id);
      
      // 执行更新
      const sql = `UPDATE records SET ${updateFields.join(', ')} WHERE id = ?`;
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          if (this.changes === 0) {
            reject(new Error('记录更新失败'));
          } else {
            // 查询更新后的记录并获取所有文件名
            const selectSql = `SELECT id, text, title, uploadTime, uploaderIP, status, carrier, fantasy FROM records WHERE id = ?`;
            db.get(selectSql, [id], (err, row) => {
              if (err) {
                reject(err);
              } else {
                // 获取记录的所有文件名
                getRecordFiles(row.id).then(filenames => {
                  resolve({
                    ...row,
                    status: 'pending', // 确保返回的状态是pending
                    filenames: filenames // 添加所有文件名
                  });
                }).catch(err => {
                  reject(err);
                });
              }
            });
          }
        }
      });
    });
  });
}

// 删除记录（包括关联的文件记录和实际文件）
function deleteRecord(id) {
  return new Promise((resolve, reject) => {
    // 开始事务
    db.serialize(() => {
      // 首先获取记录信息，包括所有关联的文件
      const selectSql = `SELECT filename FROM record_files WHERE recordId = ?`;
      db.all(selectSql, [id], (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        
        // 删除记录关联的文件记录
        const deleteFilesSql = `DELETE FROM record_files WHERE recordId = ?`;
        db.run(deleteFilesSql, [id], function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          // 删除记录本身
          const deleteRecordSql = `DELETE FROM records WHERE id = ?`;
          db.run(deleteRecordSql, [id], function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            if (this.changes === 0) {
              reject(new Error('记录不存在'));
              return;
            }
            
            // 删除实际的文件
            const uploadDir = path.join(__dirname, 'uploads');
            files.forEach(file => {
              const filePath = path.join(uploadDir, file.filename);
              if (fs.existsSync(filePath)) {
                try {
                  fs.unlinkSync(filePath);
                } catch (error) {
                  console.error('删除文件失败:', filePath, error);
                }
              }
            });
            
            resolve({ id, message: '记录删除成功' });
          });
        });
      });
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
      
      const sql = `INSERT INTO comments(id, recordId, content, commenterIP, commentTime, status)
                   VALUES(?, ?, ?, ?, ?, ?)`;
      const params = [
        commentId,
        recordId,
        comment.content,
        comment.commenterIP,
        comment.commentTime,
        'pending'  // 默认状态为待审核
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
            commentTime: comment.commentTime,
            status: 'pending'  // 返回状态
          });
        }
      });
    });
  });
}

// 获取指定记录的所有评论
function getCommentsByRecordId(recordId) {
  return new Promise((resolve, reject) => {
    // 只返回已审核通过的评论
    const sql = `SELECT id, recordId, content, commenterIP, commentTime 
                 FROM comments 
                 WHERE recordId = ? AND status = 'approved'
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

// 获取所有待审核评论（仅管理员）
function getPendingComments() {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, recordId, content, commenterIP, commentTime 
                 FROM comments 
                 WHERE status = 'pending'
                 ORDER BY commentTime ASC`;

    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 审核评论（仅管理员）
function reviewComment(id, status) {
  return new Promise((resolve, reject) => {
    // 检查状态是否有效
    if (!['approved', 'rejected'].includes(status)) {
      reject(new Error('无效的审核状态'));
      return;
    }

    const sql = `UPDATE comments SET status = ? WHERE id = ?`;
    const params = [status, id];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        if (this.changes === 0) {
          reject(new Error('评论不存在'));
        } else {
          resolve({ id, status });
        }
      }
    });
  });
}

// 删除评论（仅管理员）
function deleteComment(id) {
  return new Promise((resolve, reject) => {
    const sql = `DELETE FROM comments WHERE id = ?`;
    
    db.run(sql, [id], function(err) {
      if (err) {
        reject(err);
      } else {
        if (this.changes === 0) {
          reject(new Error('评论不存在'));
        } else {
          resolve({ id, message: '评论删除成功' });
        }
      }
    });
  });
}

// 获取记录的所有文件
function getRecordFiles(recordId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT filename FROM record_files WHERE recordId = ?`;
    
    db.all(sql, [recordId], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(row => row.filename));
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

// 测试辅助函数 - 不在生产环境中导出
if (process.env.NODE_ENV === 'test') {
  module.exports.__testRun = function(sql, params, callback) {
    db.run(sql, params, callback);
  };
  
  module.exports.__testGenerateUniqueId = generateUniqueId;
}

module.exports = {
  initializeDatabase,
  generateKey,
  saveKey,
  validateKey,
  markKeyAsUsed,
  checkUploadLimit,
  setAdminPassword,
  validateAdminPassword,
  isAdminPasswordSet,  // 添加检查管理员密码是否已设置的函数
  saveRecord,
  getAllRecords,
  getPendingRecords,
  reviewRecord,
  getRandomRecord,
  getApprovedRecords,
  editRecord,
  deleteRecord,  // 添加删除记录函数
  addComment,
  getCommentsByRecordId,
  getPendingComments,  // 添加获取待审核评论函数
  reviewComment,       // 添加审核评论函数
  deleteComment,       // 添加删除评论函数
  getRecordFiles,  // 导出新函数
  closeDatabase,
  deleteComment       // 添加删除评论函数
};