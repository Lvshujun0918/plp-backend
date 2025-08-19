# PLP 后端项目

这是一个基于 Node.js 和 SQLite 的图片上传和评论系统。用户可以上传图片并添加描述文字，其他用户可以对这些图片添加评论。系统还提供了完整的管理员功能，包括内容审核和管理。

## 功能特性

- 图片上传和存储（支持多图片上传）
- 为上传的图片添加文字描述和标题
- 基于上传者 IP 生成唯一文件名
- 随机获取图片功能
- 为图片添加评论功能
- 使用 SQLite 数据库存储数据
- 通过 Swagger UI 提供完整的 API 文档
- 管理员内容审核机制（图片和评论）
- 图片文字组编辑功能
- 内容版本对比（编辑前后的对比）

## 技术栈

- [Node.js](https://nodejs.org/) - 运行时环境
- [Express](https://expressjs.com/) - Web 应用框架
- [SQLite](https://www.sqlite.org/) - 数据库
- [Multer](https://github.com/expressjs/multer) - 文件上传中间件
- [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express) - API 文档界面
- [JSON Web Token](https://github.com/auth0/node-jsonwebtoken) - 管理员认证

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

### 用户功能接口
- `POST /api/upload` - 上传图片（支持多图片）
- `GET /api/records` - 获取所有已审核通过的图片记录
- `GET /api/random` - 随机获取一张已审核通过的图片
- `POST /api/records/{id}/comments` - 为指定图片添加评论
- `GET /api/records/{id}/comments` - 获取指定图片的所有已审核评论
- `PUT /api/records/{id}` - 编辑指定的图片文字组（仅可编辑且已审核通过的记录）
- `GET /api/key` - 获取上传秘钥

### 管理员功能接口
- `POST /api/admin/init` - 初始化管理员密码（仅首次使用时调用）
- `POST /api/admin/login` - 管理员登录
- `GET /api/records/pending` - 获取所有待审核的图片记录
- `POST /api/records/{id}/review` - 审核图片记录
- `DELETE /api/records/{id}` - 删除指定图片记录
- `GET /api/comments/pending` - 获取所有待审核的评论
- `POST /api/comments/{id}/review` - 审核评论
- `DELETE /api/comments/{id}` - 删除指定评论

## 项目结构

```
plp-backend/
├── db.js              # 数据库操作模块
├── server.js          # 主服务文件
├── package.json       # 项目配置文件
├── uploads/           # 图片上传目录（运行时自动创建）
└── database.sqlite    # SQLite 数据库文件（运行时自动创建）
```

## 审核流程说明

系统采用内容审核机制确保平台内容质量：

1. 用户上传的图片和文字默认状态为"待审核"
2. 用户添加的评论默认状态为"待审核"
3. 管理员可以查看所有待审核内容
4. 管理员可以将内容状态设置为"通过"或"拒绝"
5. 只有状态为"通过"的内容才会对普通用户可见
6. 用户可以编辑已审核通过且标记为可编辑的记录
7. 编辑后的记录会自动变为"待审核"状态
8. 管理员审核通过编辑内容后，新内容成为基准内容

## 许可证

本项目暂无特定许可证。