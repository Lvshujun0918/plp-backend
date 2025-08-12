const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

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

// Swagger配置
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '图片上传与评论系统 API',
      version: '1.0.0',
      description: '一个基于 Node.js 和 SQLite 的图片上传和评论系统',
    },
    servers: [
      {
        url: `http://localhost:${PORT}/api`,
        description: '开发服务器',
      },
    ],
  },
  apis: ['./server.js'], // 指向包含注释的文件
};

const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// 初始化数据库
db.initializeDatabase();

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: 上传图片
 *     description: 上传图片并添加描述文字
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: 要上传的图片文件
 *               text:
 *                 type: string
 *                 description: 图片描述文字
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 上传成功
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 1a2b3c4d
 *                     filename:
 *                       type: string
 *                       example: a1b2c3d4e5f-1632123456789-123456789.jpg
 *                     text:
 *                       type: string
 *                       example: 这是一张美丽的风景图片
 *                     uploadTime:
 *                       type: string
 *                       format: date-time
 *                       example: 2023-09-20T10:30:00.000Z
 *                     fileSize:
 *                       type: integer
 *                       example: 102400
 *                     uploaderIP:
 *                       type: string
 *                       example: ::1
 *       400:
 *         description: 没有上传文件
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 没有上传文件
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 服务器内部错误
 */
// 上传图片并记录文字的接口
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    // 检查是否上传了文件
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    // 获取文字信息
    const text = req.body.text || '';

    // 创建新记录（已去除originalname字段，ID由数据库模块生成）
    const record = {
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

/**
 * @swagger
 * /records:
 *   get:
 *     summary: 获取所有记录
 *     description: 获取所有上传的图片记录
 *     responses:
 *       200:
 *         description: 成功获取所有记录
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: 1a2b3c4d
 *                   filename:
 *                     type: string
 *                     example: a1b2c3d4e5f-1632123456789-123456789.jpg
 *                   text:
 *                     type: string
 *                     example: 这是一张美丽的风景图片
 *                   uploadTime:
 *                     type: string
 *                     format: date-time
 *                     example: 2023-09-20T10:30:00.000Z
 *                   fileSize:
 *                     type: integer
 *                     example: 102400
 *                   uploaderIP:
 *                     type: string
 *                     example: ::1
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 服务器内部错误
 */
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

/**
 * @swagger
 * /random:
 *   get:
 *     summary: 随机获取一条记录
 *     description: 随机返回一条图片记录
 *     responses:
 *       200:
 *         description: 成功获取随机记录
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 1a2b3c4d
 *                 filename:
 *                   type: string
 *                   example: a1b2c3d4e5f-1632123456789-123456789.jpg
 *                 text:
 *                   type: string
 *                   example: 这是一张美丽的风景图片
 *                 uploadTime:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-09-20T10:30:00.000Z
 *                 fileSize:
 *                   type: integer
 *                   example: 102400
 *                 uploaderIP:
 *                   type: string
 *                   example: ::1
 *       404:
 *         description: 没有可用的记录
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 没有可用的记录
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 服务器内部错误
 */
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

/**
 * @swagger
 * /records/{id}/comments:
 *   post:
 *     summary: 添加评论
 *     description: 为指定ID的图片记录添加评论
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 记录ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: 评论内容
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: 评论添加成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 评论添加成功
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: comment-1a2b3c4d
 *                     recordId:
 *                       type: string
 *                       example: 1a2b3c4d
 *                     content:
 *                       type: string
 *                       example: 这张图片真的很美！
 *                     commenterIP:
 *                       type: string
 *                       example: ::1
 *                     commentTime:
 *                       type: string
 *                       format: date-time
 *                       example: 2023-09-20T11:00:00.000Z
 *       400:
 *         description: 评论内容不能为空
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 评论内容不能为空
 *       404:
 *         description: 指定的记录不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 指定的记录不存在
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 服务器内部错误
 */
// 为指定ID的记录添加评论
app.post('/api/records/:id/comments', async (req, res) => {
  try {
    const recordId = req.params.id;
    const { content } = req.body;

    // 检查评论内容
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    // 创建评论对象
    const comment = {
      content: content.trim(),
      commenterIP: req.connection.remoteAddress || req.socket.remoteAddress || 
                  (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                  (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'),
      commentTime: new Date().toISOString()
    };

    // 添加评论到数据库
    const savedComment = await db.addComment(recordId, comment);

    // 返回成功响应
    res.status(200).json({
      message: '评论添加成功',
      data: savedComment
    });
  } catch (error) {
    console.error('添加评论错误:', error);
    
    if (error.message === '指定的记录不存在') {
      return res.status(404).json({ error: '指定的记录不存在' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /records/{id}/comments:
 *   get:
 *     summary: 获取指定记录的所有评论
 *     description: 获取指定图片记录的所有评论
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 记录ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取评论
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: comment-1a2b3c4d
 *                   recordId:
 *                     type: string
 *                     example: 1a2b3c4d
 *                   content:
 *                     type: string
 *                     example: 这张图片真的很美！
 *                   commenterIP:
 *                     type: string
 *                     example: ::1
 *                   commentTime:
 *                     type: string
 *                     format: date-time
 *                     example: 2023-09-20T11:00:00.000Z
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 服务器内部错误
 */
// 获取指定ID记录的所有评论
app.get('/api/records/:id/comments', async (req, res) => {
  try {
    const recordId = req.params.id;
    
    // 获取评论
    const comments = await db.getCommentsByRecordId(recordId);
    
    res.status(200).json(comments);
  } catch (error) {
    console.error('获取评论错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`API文档地址: http://localhost:${PORT}/api-docs`);
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