const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// 数据存储（在实际应用中应使用数据库）
const dataFile = 'data.json';
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify([]));
}

// 上传图片并记录文字的接口
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    // 检查是否上传了文件
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    // 获取文字信息
    const text = req.body.text || '';

    // 读取现有数据
    const data = JSON.parse(fs.readFileSync(dataFile));

    // 创建新记录
    const record = {
      id: Date.now(),
      filename: req.file.filename,
      originalname: req.file.originalname,
      text: text,
      uploadTime: new Date().toISOString()
    };

    // 保存记录
    data.push(record);
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

    // 返回成功响应
    res.status(200).json({
      message: '上传成功',
      data: record
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取所有记录的接口
app.get('/api/records', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile));
    res.status(200).json(data);
  } catch (error) {
    console.error('获取记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});