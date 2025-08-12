const fs = require('fs');
const path = require('path');

const DB_FILE = 'database.json';

// 初始化数据库文件
function initializeDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
  }
}

// 读取数据库
function readDatabase() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('读取数据库错误:', error);
    return [];
  }
}

// 写入数据库
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('写入数据库错误:', error);
    return false;
  }
}

// 保存记录到数据库
function saveRecord(record) {
  try {
    const db = readDatabase();
    
    // 添加新记录
    db.push(record);
    
    // 写回数据库文件
    writeDatabase(db);
    
    return record;
  } catch (error) {
    console.error('保存记录错误:', error);
    return null;
  }
}

// 获取所有记录
function getAllRecords() {
  return readDatabase();
}

// 随机获取一个记录
function getRandomRecord() {
  const db = readDatabase();
  if (db.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * db.length);
  return db[randomIndex];
}

// 导出所有函数
module.exports = {
  initializeDatabase,
  saveRecord,
  getAllRecords,
  getRandomRecord
};
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

// 创建上传目录
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 获取客户端IP地址
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 
                  (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                  (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');
    
    // 基于IP生成hash
    const ipHash = crypto.createHash('md5').update(clientIP).digest('hex');
    
    // 生成新的文件名
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const newFilename = ipHash + '-' + timestamp + '-' + randomSuffix + ext;
    
    cb(null, newFilename);
  }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
db.initializeDatabase();

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// 上传图片并记录文字的接口
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    // 检查是否上传了文件
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    // 获取文字信息
    const text = req.body.text || '';

    // 创建新记录（已去除originalname字段）
    const record = {
      id: Date.now(),
      filename: req.file.filename,
      text: text,
      uploadTime: new Date().toISOString(),
      fileSize: req.file.size,
      uploaderIP: req.connection.remoteAddress || req.socket.remoteAddress || 
                  (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                  (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown')
    };

    // 保存记录到数据库
    const savedRecord = await db.saveRecord(record);

    // 返回成功响应
    res.status(200).json({
      message: '上传成功',
      data: savedRecord
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取所有记录的接口
app.get('/api/records', async (req, res) => {
  try {
    const data = await db.getAllRecords();
    res.status(200).json(data);
  } catch (error) {
    console.error('获取记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 随机获取一个图片和文字的接口
app.get('/api/random', async (req, res) => {
  try {
    const randomRecord = await db.getRandomRecord();
    
    // 检查是否有记录
    if (!randomRecord) {
      return res.status(404).json({ error: '没有可用的记录' });
    }
    
    // 返回随机记录
    res.status(200).json(randomRecord);
  } catch (error) {
    console.error('获取随机记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});

// 优雅关闭服务器
process.on('SIGINT', () => {
  console.log('正在关闭服务器...');
  db.closeDatabase();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
