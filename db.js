const fs = require('fs');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, 'database.sqlite');

// 检查数据库文件是否存在
function databaseExists() {
  return fs.existsSync(dbPath);
}

// 初始化数据库
function initializeDatabase() {
  // 在这个简化版本中，我们继续使用JSON文件作为存储
  // 在实际项目中，这里会初始化SQLite数据库
  console.log('Database module loaded (using JSON file as storage for now)');
}

// 保存记录
function saveRecord(record) {
  const data = readDataFile();
  data.push(record);
  writeDataFile(data);
  return record;
}

// 获取所有记录
function getAllRecords() {
  return readDataFile();
}

// 获取随机记录
function getRandomRecord() {
  const data = readDataFile();
  if (data.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * data.length);
  return data[randomIndex];
}

// 读取数据文件的辅助函数
function readDataFile() {
  const dataFile = path.join(__dirname, 'data.json');
  // 如果文件不存在，创建一个空数组
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([]));
    return [];
  }
  
  // 读取文件内容
  const data = fs.readFileSync(dataFile, 'utf8');
  
  // 如果文件为空，返回空数组
  if (!data || data.trim() === '') {
    return [];
  }
  
  // 解析并返回数据
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('JSON解析错误:', error);
    return [];
  }
}

// 写入数据文件的辅助函数
function writeDataFile(data) {
  const dataFile = path.join(__dirname, 'data.json');
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

module.exports = {
  initializeDatabase,
  saveRecord,
  getAllRecords,
  getRandomRecord
};