const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const jwt = require('jsonwebtoken');
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

// 创建一个内存存储的multer实例，用于临时存储文件
const memoryStorage = multer.memoryStorage();
const uploadToMemory = multer({ storage: memoryStorage });

// 创建一个磁盘存储的multer实例
const uploadToDisk = multer({ storage: storage });

const app = express();
const PORT = process.env.PORT || 3001;

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'plp_backend_default_secret_key';

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
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
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

// 管理员鉴权中间件
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: '缺少认证信息' });
  }
  
  // 检查是否为Bearer token格式
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '认证格式错误' });
  }
  
  const token = authHeader.substring(7); // 去掉 "Bearer " 前缀
  
  try {
    // 验证JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '认证失败' });
  }
}

/**
 * @swagger
 * /api/admin/init:
 *   post:
 *     summary: 初始化管理员密码
 *     description: 设置管理员密码（仅在首次使用时调用）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: 管理员密码
 *             required:
 *               - password
 *     responses:
 *       200:
 *         description: 密码设置成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 管理员密码设置成功
 *       400:
 *         description: 密码不能为空或管理员密码已设置
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 管理员密码已设置
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
// 初始化管理员密码接口
app.post('/api/admin/init', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }
    
    // 检查管理员密码是否已设置
    const isSet = await db.isAdminPasswordSet();
    if (isSet) {
      return res.status(400).json({ error: '管理员密码已设置' });
    }
    
    // 设置管理员密码
    await db.setAdminPassword(password);
    
    res.status(200).json({ message: '管理员密码设置成功' });
  } catch (error) {
    console.error('设置管理员密码错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /admin/login:
 *   post:
 *     summary: 管理员登录
 *     description: 使用管理员密码登录获取访问令牌
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: 管理员密码
 *             required:
 *               - password
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: your_jwt_token
 *       401:
 *         description: 密码错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 密码错误
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
// 管理员登录接口
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }
    
    // 验证管理员密码
    const isValid = await db.validateAdminPassword(password);
    
    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }
    
    // 生成JWT访问令牌
    const token = jwt.sign(
      { id: 1, role: 'admin' }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    res.status(200).json({ token });
  } catch (error) {
    console.error('管理员登录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /key:
 *   get:
 *     summary: 获取上传秘钥
 *     description: 根据IP地址和User-Agent生成一个当日有效的上传秘钥
 *     responses:
 *       200:
 *         description: 成功生成秘钥
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                   example: 5f4dcc3b5aa765d61d8327deb882cf99
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
// 获取秘钥接口
app.get('/api/key', async (req, res) => {
  try {
    // 获取客户端IP地址
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 
                    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                    (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');
    
    // 获取User-Agent
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // 检查今日是否已上传过
    const hasUploaded = await db.checkUploadLimit(clientIP);
    if (hasUploaded) {
      return res.status(400).json({ error: '您今天已经上传过图片了' });
    }
    
    // 生成秘钥
    const key = db.generateKey(clientIP, userAgent);
    
    // 保存秘钥
    await db.saveKey(key, clientIP, userAgent);
    
    // 返回秘钥
    res.status(200).json({ key });
  } catch (error) {
    console.error('获取秘钥错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: 上传图片
 *     description: 使用有效的秘钥上传图片并添加描述文字
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: 要上传的图片文件数组（支持0张或多张）
 *               text:
 *                 type: string
 *                 description: 图片描述文字
 *               title:
 *                 type: string
 *                 description: 图片标题
 *               key:
 *                 type: string
 *                 description: 上传秘钥
 *               carrier:
 *                 type: integer
 *                 description: 类型字段，0表示可编辑，1表示不可编辑
 *                 example: 0
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
 *                     text:
 *                       type: string
 *                       example: 这是一张美丽的风景图片
 *                     title:
 *                       type: string
 *                       example: 美丽的风景
 *                     originalText:
 *                       type: string
 *                       example: 这是一张美丽的风景图片
 *                     originalTitle:
 *                       type: string
 *                       example: 美丽的风景
 *                     uploadTime:
 *                       type: string
 *                       format: date-time
 *                       example: 2023-09-20T10:30:00.000Z
 *                     uploaderIP:
 *                       type: string
 *                       example: ::1
 *                     status:
 *                       type: string
 *                       example: pending
 *                     carrier:
 *                       type: integer
 *                       example: 0
 *                     fantasy:
 *                       type: integer
 *                       example: 3
 *                     filenames:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["a1b2c3d4e5f-1632123456789-123456789.jpg"]
 *       400:
 *         description: 秘钥无效或今日已上传过
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 秘钥无效或已使用
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
app.post('/api/upload', uploadToMemory.array('images', 10), async (req, res) => {
  try {
    // 获取文字信息和秘钥
    const text = req.body.text || '';
    const title = req.body.title || ''; // 获取标题
    const key = req.body.key;
    const carrier = parseInt(req.body.carrier) || 0; // 默认为可编辑
    const imageCount = req.files ? req.files.length : 0; // 根据实际上传的图片数量生成fantasy值

    // 获取客户端IP地址和User-Agent
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 
                    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                    (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');
    const userAgent = req.get('User-Agent') || 'unknown';

    // 验证秘钥
    if (!key) {
      return res.status(400).json({ error: '缺少秘钥' });
    }

    const isValidKey = await db.validateKey(key, clientIP, userAgent);
    if (!isValidKey) {
      return res.status(400).json({ error: '秘钥无效或已使用' });
    }

    // 标记秘钥为已使用
    await db.markKeyAsUsed(key);

    // 创建新记录，fantasy值根据实际上传的图片数量自动生成
    const record = {
      text: text,
      title: title, // 添加标题
      uploadTime: new Date().toISOString(),
      uploaderIP: clientIP,
      carrier: carrier,
      fantasy: imageCount, // 根据实际上传的图片数量生成fantasy值
      files: req.files // 传递所有文件
    };

    // 保存记录到数据库
    const savedRecord = await db.saveRecord(record);

    // 返回成功响应
    res.status(200).json({
      message: '上传成功，等待审核',
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
 *     summary: 获取所有已审核通过的记录
 *     description: 获取所有已审核通过的图片记录
 *     responses:
 *       200:
 *         description: 成功获取所有已审核记录
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
 *                   text:
 *                     type: string
 *                     example: 这是一张美丽的风景图片
 *                   title:
 *                     type: string
 *                     example: 美丽的风景
 *                   originalText:
 *                     type: string
 *                     example: 这是一张美丽的风景图片
 *                   originalTitle:
 *                     type: string
 *                     example: 美丽的风景
 *                   uploadTime:
 *                     type: string
 *                     format: date-time
 *                     example: 2023-09-20T10:30:00.000Z
 *                   uploaderIP:
 *                     type: string
 *                     example: ::1
 *                   status:
 *                     type: string
 *                     example: approved
 *                   carrier:
 *                     type: integer
 *                     example: 0
 *                   fantasy:
 *                     type: integer
 *                     example: 3
 *                   filenames:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["a1b2c3d4e5f-1632123456789-123456789.jpg"]
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
// 获取所有已审核通过的记录接口
app.get('/api/records', async (req, res) => {
  try {
    const data = await db.getApprovedRecords();
    res.status(200).json(data);
  } catch (error) {
    console.error('获取记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /records/pending:
 *   get:
 *     summary: 获取所有待审核记录
 *     description: 管理员获取所有待审核的图片记录
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取所有待审核记录
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
 *                   text:
 *                     type: string
 *                     example: 这是一张美丽的风景图片
 *                   title:
 *                     type: string
 *                     example: 美丽的风景
 *                   originalText:
 *                     type: string
 *                     example: 这是一张美丽的风景图片
 *                   originalTitle:
 *                     type: string
 *                     example: 美丽的风景
 *                   uploadTime:
 *                     type: string
 *                     format: date-time
 *                     example: 2023-09-20T10:30:00.000Z
 *                   uploaderIP:
 *                     type: string
 *                     example: ::1
 *                   status:
 *                     type: string
 *                     example: pending
 *                   carrier:
 *                     type: integer
 *                     example: 0
 *                   fantasy:
 *                     type: integer
 *                     example: 3
 *                   filenames:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["a1b2c3d4e5f-1632123456789-123456789.jpg"]
 *       401:
 *         description: 未授权访问
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 缺少认证信息
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
// 获取所有待审核记录接口（管理员使用）
app.get('/api/records/pending', requireAdminAuth, async (req, res) => {
  try {
    const data = await db.getPendingRecords();
    res.status(200).json(data);
  } catch (error) {
    console.error('获取待审核记录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /records/{id}/review:
 *   post:
 *     summary: 审核记录
 *     description: 管理员审核指定ID的图片记录
 *     security:
 *       - bearerAuth: []
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
 *               status:
 *                 type: string
 *                 description: 审核状态（approved 或 rejected）
 *                 example: approved
 *             required:
 *               - status
 *     responses:
 *       200:
 *         description: 审核成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 1a2b3c4d
 *                 status:
 *                   type: string
 *                   example: approved
 *       400:
 *         description: 无效的审核状态
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 无效的审核状态
 *       401:
 *         description: 未授权访问
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 缺少认证信息
 *       404:
 *         description: 记录不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 记录不存在
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
// 审核记录接口（管理员使用）
app.post('/api/records/:id/review', requireAdminAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    const { status } = req.body;

    // 如果审核状态为rejected，删除对应的文件
    if (status === 'rejected') {
      // 先获取记录信息
      const records = await db.getAllRecords();
      const record = records.find(r => r.id === recordId);
      
      if (record && record.filename) {
        // 删除文件
        const filePath = path.join(uploadDir, record.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // 审核记录
    const result = await db.reviewRecord(recordId, status);

    // 返回成功响应
    res.status(200).json(result);
  } catch (error) {
    console.error('审核记录错误:', error);
    
    if (error.message === '无效的审核状态') {
      return res.status(400).json({ error: '无效的审核状态' });
    }
    
    if (error.message === '记录不存在') {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/records/{id}:
 *   put:
 *     summary: 编辑记录
 *     description: 编辑指定ID的可编辑记录（仅可编辑且已审核通过的记录）
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 记录ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: 新的文字内容（留空表示不更改）
 *               title:
 *                 type: string
 *                 description: 新的标题（留空表示不更改）
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: 新的图片文件数组（留空表示不更改，支持0张或多张）
 *     responses:
 *       200:
 *         description: 编辑成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 1a2b3c4d
 *                 text:
 *                   type: string
 *                   example: 这是一张美丽的风景图片
 *                 title:
 *                   type: string
 *                   example: 美丽的风景
 *                 originalText:
 *                   type: string
 *                   example: 这是一张美丽的风景图片
 *                 originalTitle:
 *                   type: string
 *                   example: 美丽的风景
 *                 uploadTime:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-09-20T10:30:00.000Z
 *                 uploaderIP:
 *                   type: string
 *                   example: ::1
 *                 status:
 *                   type: string
 *                   example: pending
 *                 carrier:
 *                   type: integer
 *                   example: 0
 *                 fantasy:
 *                   type: integer
 *                   example: 3
 *                 filenames:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["a1b2c3d4e5f-1632123456789-123456789.jpg"]
 *       400:
 *         description: 记录不可编辑或参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 记录不存在、不可编辑或未审核通过
 *       404:
 *         description: 记录不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 记录不存在
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
// 编辑记录接口
app.put('/api/records/:id', uploadToMemory.array('images', 10), async (req, res) => {
  try {
    const recordId = req.params.id;
    const { text, title } = req.body; // 获取标题

    // 获取客户端IP地址
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 
                    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                    (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown');

    // 构建更新对象
    const updates = {};
    if (text !== undefined) {
      updates.text = text;
    }
    
    if (title !== undefined) {
      updates.title = title;
    }
    
    // 如果上传了新图片，则添加图片信息
    if (req.files && req.files.length > 0) {
      updates.images = req.files;
      // 根据实际上传的图片数量更新fantasy值
      updates.fantasy = req.files.length;
    }

    // 编辑记录
    const result = await db.editRecord(recordId, updates, uploadDir, clientIP);

    // 返回成功响应
    res.status(200).json(result);
  } catch (error) {
    console.error('编辑记录错误:', error);
    
    if (error.message === '记录不存在、不可编辑或未审核通过') {
      return res.status(400).json({ error: '记录不存在、不可编辑或未审核通过' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /random:
 *   get:
 *     summary: 随机获取一条已审核通过的记录
 *     description: 随机返回一条已审核通过的图片记录
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
 *                 text:
 *                   type: string
 *                   example: 这是一张美丽的风景图片
 *                 title:
 *                   type: string
 *                   example: 美丽的风景
 *                 originalText:
 *                   type: string
 *                   example: 这是一张美丽的风景图片
 *                 originalTitle:
 *                   type: string
 *                   example: 美丽的风景
 *                 uploadTime:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-09-20T10:30:00.000Z
 *                 uploaderIP:
 *                   type: string
 *                   example: ::1
 *                 status:
 *                   type: string
 *                   example: approved
 *                 carrier:
 *                   type: integer
 *                   example: 0
 *                 fantasy:
 *                   type: integer
 *                   example: 3
 *                 filenames:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["a1b2c3d4e5f-1632123456789-123456789.jpg"]
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
// 随机获取一个已审核通过的图片和文字的接口
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
 *     description: 为指定ID的已审核通过的图片记录添加评论
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
 *         description: 评论内容不能为空或记录未审核通过
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 评论内容不能为空
 *       404:
 *         description: 指定的记录不存在或未审核通过
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 指定的记录不存在或未审核通过
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
    
    if (error.message === '指定的记录不存在或未审核通过') {
      return res.status(404).json({ error: '指定的记录不存在或未审核通过' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /records/{id}/comments:
 *   get:
 *     summary: 获取指定记录的所有评论
 *     description: 获取指定图片记录的所有已审核通过的评论
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: 记录ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取已审核通过的评论
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
    
    // 获取评论（只返回已审核通过的评论）
    const comments = await db.getCommentsByRecordId(recordId);
    
    res.status(200).json(comments);
  } catch (error) {
    console.error('获取评论错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/comments/pending:
 *   get:
 *     summary: 获取所有待审核评论（仅管理员）
 *     description: 获取所有待审核的评论列表
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功获取待审核评论列表
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
 *       401:
 *         description: 认证失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 认证失败
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
// 获取所有待审核评论接口（仅管理员）
app.get('/api/comments/pending', requireAdminAuth, async (req, res) => {
  try {
    const pendingComments = await db.getPendingComments();
    res.status(200).json(pendingComments);
  } catch (error) {
    console.error('获取待审核评论错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/comments/{id}/review:
 *   post:
 *     summary: 审核评论（仅管理员）
 *     description: 审核指定ID的评论，可设置为通过或拒绝
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 评论ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: 审核状态，可选值为approved（通过）或rejected（拒绝）
 *                 enum: [approved, rejected]
 *             required:
 *               - status
 *     responses:
 *       200:
 *         description: 评论审核成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: comment-1a2b3c4d
 *                 status:
 *                   type: string
 *                   example: approved
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 无效的审核状态
 *       401:
 *         description: 认证失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 认证失败
 *       404:
 *         description: 评论不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 评论不存在
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
// 审核评论接口（仅管理员）
app.post('/api/comments/:id/review', requireAdminAuth, async (req, res) => {
  try {
    const commentId = req.params.id;
    const { status } = req.body;
    
    // 审核评论
    const result = await db.reviewComment(commentId, status);
    
    // 返回成功响应
    res.status(200).json(result);
  } catch (error) {
    console.error('审核评论错误:', error);
    
    if (error.message === '无效的审核状态') {
      return res.status(400).json({ error: '无效的审核状态' });
    }
    
    if (error.message === '评论不存在') {
      return res.status(404).json({ error: '评论不存在' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /api/comments/{id}:
 *   delete:
 *     summary: 删除指定评论（仅管理员）
 *     description: 管理员删除指定的评论
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 评论ID
 *     responses:
 *       200:
 *         description: 评论删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: comment-1a2b3c4d
 *                 message:
 *                   type: string
 *                   example: 评论删除成功
 *       401:
 *         description: 认证失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 认证失败
 *       404:
 *         description: 评论不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 评论不存在
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
// 删除评论接口（仅管理员）
app.delete('/api/comments/:id', requireAdminAuth, async (req, res) => {
  try {
    const commentId = req.params.id;
    
    // 删除评论
    const result = await db.deleteComment(commentId);
    
    // 返回成功响应
    res.status(200).json(result);
  } catch (error) {
    console.error('删除评论错误:', error);
    
    if (error.message === '评论不存在') {
      return res.status(404).json({ error: '评论不存在' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * @swagger
 * /records/{id}:
 *   delete:
 *     summary: 删除指定记录（仅管理员）
 *     description: 管理员删除指定的记录，包括关联的文件
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 记录ID
 *     responses:
 *       200:
 *         description: 记录删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 1a2b3c4d
 *                 message:
 *                   type: string
 *                   example: 记录删除成功
 *       401:
 *         description: 认证失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 认证失败
 *       404:
 *         description: 记录不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: 记录不存在
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
// 删除记录接口（仅管理员）
app.delete('/api/records/:id', requireAdminAuth, async (req, res) => {
  try {
    const recordId = req.params.id;
    
    // 删除记录
    const result = await db.deleteRecord(recordId);
    
    // 返回成功响应
    res.status(200).json(result);
  } catch (error) {
    console.error('删除记录错误:', error);
    
    if (error.message === '记录不存在') {
      return res.status(404).json({ error: '记录不存在' });
    }
    
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`API文档地址: http://localhost:${PORT}/api-docs`);
  
  // 如果没有设置环境变量JWT_SECRET，则使用默认值
  if (!process.env.JWT_SECRET) {
    console.log('注意：使用默认JWT密钥，生产环境请设置 JWT_SECRET 环境变量');
  }
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

module.exports = app;