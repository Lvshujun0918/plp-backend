# PLP 后端项目

这是一个基于 Node.js 和 SQLite 的图片上传和评论系统。用户可以上传图片并添加描述文字，其他用户可以对这些图片添加评论。

## 功能特性

- 图片上传和存储
- 为上传的图片添加文字描述
- 基于上传者 IP 生成唯一文件名
- 随机获取图片功能
- 为图片添加评论功能
- 使用 SQLite 数据库存储数据
- 通过 Swagger UI 提供完整的 API 文档

## 技术栈

- [Node.js](https://nodejs.org/) - 运行时环境
- [Express](https://expressjs.com/) - Web 应用框架
- [SQLite](https://www.sqlite.org/) - 数据库
- [Multer](https://github.com/expressjs/multer) - 文件上传中间件
- [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express) - API 文档界面

## 安装与运行

### 环境要求

- Node.js v14.x 或更高版本
- npm（随 Node.js 安装）

### 安装步骤

1. 克隆项目代码：
   ```bash
   git clone <项目地址>
   cd plp-backend
   ```

2. 安装项目依赖：
   ```bash
   npm install
   ```

### 运行项目

- 开发环境运行：
  ```bash
  npm run dev
  ```

- 生产环境运行：
  ```bash
  npm start
  ```

项目默认运行在 `http://localhost:3000`

## API 文档

项目集成了 Swagger UI 提供交互式 API 文档。

启动项目后，可以通过以下地址访问 API 文档：
```
http://localhost:3000/api-docs
```

在 API 文档界面中，您可以：
- 查看所有 API 接口的详细说明
- 直接测试每个接口
- 查看请求参数和响应格式示例
- 了解错误处理机制

## API 接口概览

- `POST /api/upload` - 上传图片
- `GET /api/records` - 获取所有图片记录
- `GET /api/random` - 随机获取一张图片
- `POST /api/records/{id}/comments` - 为指定图片添加评论
- `GET /api/records/{id}/comments` - 获取指定图片的所有评论

## 项目结构

```
plp-backend/
├── db.js              # 数据库操作模块
├── server.js          # 主服务文件
├── package.json       # 项目配置文件
├── uploads/           # 图片上传目录（运行时自动创建）
└── database.sqlite    # SQLite 数据库文件（运行时自动创建）
```

## 许可证

本项目暂无特定许可证。