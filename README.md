
# 🗜️ repo-compress

> 将 GitHub 项目 ZIP 压缩包转换为 AI 友好的单文件格式

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)

---

## ✨ 特性

- 🎯 **拖入即转换** - 支持直接拖入 ZIP 文件（现有工具不支持）
- 📝 **三种格式** - Markdown / XML / 纯文本，针对不同 AI 优化
- 🚀 **零配置** - 开箱即用，智能过滤常见无用文件
- 🌐 **双模式** - Web UI（无需安装）+ CLI（批量处理）
- 🔒 **隐私优先** - 浏览器端处理，数据不上传
- 🇨🇳 **国内友好** - 不依赖 GitHub API
- 🔍 **缓存检测** - 自动检测影响 AI Prompt 缓存的动态内容

---

## 📖 目录

- [快速开始](#-快速开始)
- [使用场景](#-使用场景)
- [输出格式对比](#-输出格式对比)
- [智能过滤](#-智能过滤)
- [缓存破坏检测](#-缓存破坏检测)
- [CLI 使用](#️-cli-使用)
- [开发](#-开发)
- [原理](#-原理)

---

## 🚀 快速开始

### Web 版（推荐新手）

1. **克隆或下载项目**
   
   git clone https://github.com/yourusername/repo-compress.git
   cd repo-compress
   

2. **安装依赖**
   
   npm install
   

3. **启动 Web UI**
   
   npm run dev
   
   浏览器会自动打开 `http://localhost:8080/src/web/`

4. **使用**
   - 拖入 ZIP 文件
   - 选择输出格式
   - 点击"开始转换"
   - 复制结果粘贴给 AI

### CLI 版（推荐开发者）

1. **全局安装**
   
   npm install -g repo-compress
   

2. **使用**
   
   # 基础用法
   repo-compress project.zip
   
   # 指定输出格式
   repo-compress project.zip -f xml -o output.xml
   
   # 显示详细统计
   repo-compress project.zip --stats
   

---

## 🎯 使用场景

### 场景 1：让 AI 分析整个项目


# 下载 GitHub 项目的 ZIP
# https://github.com/user/repo → Code → Download ZIP

# 转换为 Markdown（ChatGPT 最佳）
repo-compress repo-main.zip -f markdown

# 或转换为 XML（Claude 最佳）
repo-compress repo-main.zip -f xml


### 场景 2：代码审查


# 只包含源代码目录
repo-compress project.zip -i "src/**" -i "*.md"

# 排除测试文件
repo-compress project.zip -e "**/*.test.js" -e "test/**"


### 场景 3：文档生成


# 只包含文档
repo-compress project.zip -i "**/*.md" -i "docs/**"


### 场景 4：AI 辅助重构


# 生成当前项目快照
repo-compress current-version.zip -f markdown

# 让 AI 分析代码结构
# 复制输出内容 → 粘贴给 Claude/ChatGPT
# 提问："请分析这个项目的架构，并建议如何重构"


---

## 🎨 输出格式对比

| 格式 | 适用 AI | 优点 | 缺点 | 推荐场景 |
|------|---------|------|------|---------|
| **Markdown** | ChatGPT / Gemini | • 代码高亮<br>• 结构清晰<br>• 人类可读性最强 | 体积稍大 | 通用首选 |
| **XML** | Claude | • 边界清晰<br>• Claude 官方推荐<br>• 解析性能最强 | 人类可读性稍差 | 大型项目 |
| **TXT** | 所有 | • 兼容性最强<br>• 体积最小 | 无代码高亮 | 简单项目 |

### 示例输出

#### Markdown 格式
`markdown
# 📦 Repository Content

## 📊 Statistics
- **Total Files**: 42
- **Total Size**: 125.34 KB
- **Estimated Tokens**: ~31,335

## 📁 Directory Structure

src/
├── index.js
├── utils/
│   └── helpers.js
└── components/
    └── App.jsx


## 📄 File Contents

### `src/index.js`

import App from './components/App';
// ...

`

#### XML 格式
xml
<?xml version="1.0" encoding="UTF-8"?>
<repository>
  <metadata>
    <totalFiles>42</totalFiles>
    <totalSize>128345</totalSize>
  </metadata>
  <files>
    <file path="src/index.js">
      <content><![CDATA[
        import App from './components/App';
      ]]></content>
    </file>
  </files>
</repository>


---

## 🔍 智能过滤

自动排除以下内容（可通过 `-e` 自定义）：

### 依赖和包管理
- `node_modules/`
- `bower_components/`
- `vendor/`

### 版本控制
- `.git/`
- `.svn/`
- `.hg/`

### 构建产物
- `dist/`
- `build/`
- `out/`
- `.next/`
- `coverage/`

### 编译产物
- `*.min.js`
- `*.min.css`
- `*.bundle.js`
- `*.map`

### 二进制和媒体
- `*.exe`, `*.dll`, `*.so`
- `*.jpg`, `*.png`, `*.gif`, `*.mp4`

### 编辑器和IDE
- `.vscode/`
- `.idea/`
- `.DS_Store`

### 敏感文件
- `.env`
- `*.key`
- `*.pem`

---

## 🔍 缓存破坏检测

基于 **Law-55（Prompt 缓存局部性法则）** 设计，自动检测可能影响 AI Prompt 缓存效率的动态内容。

### 检测的 14 类向量

| 类型 | 示例 | 严重度 |
|------|------|--------|
| **时间戳** | `2024-01-01T12:00:00` | 🚨 HIGH |
| **随机 ID** | `550e8400-e29b-41d4` | 🚨 HIGH |
| **会话 ID** | `session_id: "abc123"` | 🚨 HIGH |
| **用户 ID** | `user_id: 12345` | ⚠️ MEDIUM |
| **环境变量** | `process.env.API_KEY` | ⚠️ MEDIUM |
| **Git 哈希** | `commit: a1b2c3d` | ⚠️ MEDIUM |
| **Agent 列表** | `agents: [...]` | ℹ️ LOW |
| **工具列表** | `tools: [...]` | ℹ️ LOW |

### 检测报告示例


🔍 Cache-Busting Detection Report

Found 3 file(s) with potential caching issues:

## 🚨 HIGH Severity
- `src/config.js`
  Issues: TIMESTAMP, SESSION

## ⚠️ MEDIUM Severity
- `src/env.js`
  Issues: ENV_VAR

💡 Suggestions:
- 🕒 Found 1 file(s) with timestamps. Consider using BOUNDARY to separate dynamic content.
- 🔐 Found 1 file(s) with session IDs. These should not be in cached prompt content.


### 优化建议

如果检测到缓存破坏向量，建议：

1. **移除动态内容** - 时间戳、会话 ID 等
2. **使用 BOUNDARY 分离** - 稳定内容在前，动态内容在后
3. **移到附件区** - 工具列表、Agent 列表等

---

## 🖥️ CLI 使用

### 基础命令


# 显示帮助
repo-compress --help

# 显示版本
repo-compress --version

# 基础转换
repo-compress project.zip


### 高级用法


# 指定输出格式和文件名
repo-compress project.zip -f xml -o analysis.xml

# 只包含特定文件
repo-compress project.zip -i "src/**" -i "*.md"

# 排除特定文件
repo-compress project.zip -e "**/*.test.js" -e "*.min.js"

# 禁用缓存检测（加快速度）
repo-compress project.zip --no-cache-detect

# 显示详细统计
repo-compress project.zip --stats


### 完整选项


选项:
  -f, --format <type>      输出格式 (markdown|xml|txt)
  -o, --output <file>      输出文件路径
  -i, --include <pattern>  只包含匹配的文件
  -e, --exclude <pattern>  排除匹配的文件
  --no-cache-detect        禁用缓存破坏检测
  --stats                  显示详细统计信息
  -h, --help               显示帮助信息
  -v, --version            显示版本号

---




## 🛠️ 开发

### 项目结构


repo-compress/
├── src/
│   ├── core/              # 核心转换引擎
│   │   ├── parser.js      # ZIP 解析
│   │   ├── filter.js      # 文件过滤
│   │   ├── converter.js   # 格式转换
│   │   └── detector.js    # 缓存检测
│   ├── web/               # Web UI
│   │   ├── index.html
│   │   ├── app.js
│   │   └── styles.css
│   ├── cli/               # CLI 接口
│   │   └── index.js
│   └── utils/             # 工具函数
│       ├── constants.js
│       └── helpers.js
├── test/                  # 测试
│   └── core.test.js
└── package.json


### 开发命令


# 安装依赖
npm install

# 启动 Web 开发服务器
npm run dev

# 运行 CLI
npm run cli -- project.zip

# 运行测试
npm test

# 代码检查
npm run lint


### 运行测试


# 运行所有测试
npm test

# 查看测试覆盖率
npm run test:coverage
---
