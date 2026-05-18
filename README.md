根据项目真实现状（已修复的问题、真正的差异化、远程仓库功能等），重写 README.md。

```markdown
# 🗜️ repo-compress

> 打包代码给 AI，同时让 Claude / GPT 的 Prompt 缓存真正生效

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)
[![Tests](https://img.shields.io/badge/tests-25%20passed-success)](test/core.test.js)

普通工具只是把代码打包成一个文件。  
**repo-compress 还会检测代码里每次都不一样的内容（时间戳、UUID、Session ID…），告诉你它们正在让 AI 的缓存失效，让你每次都多付钱。**

---

## ✨ 特性

| | 功能 | 说明 |
|---|---|---|
| 🎯 | **拖入即转换** | 支持直接拖入 ZIP 文件，无需命令行 |
| 🌐 | **远程仓库直连** | 输入 `owner/repo` 直接获取，无需手动下载 ZIP |
| 📝 | **三种输出格式** | Markdown / XML / 纯文本，针对不同 AI 优化 |
| 🔍 | **缓存破坏检测** | 自动找出让 Prompt Cache 失效的动态内容 |
| 💰 | **省钱估算** | 实时计算启用缓存后每月可节省多少 API 费用 |
| 🔒 | **隐私优先** | 所有处理在浏览器本地完成，代码不上传任何服务器 |
| 🚀 | **零配置** | 开箱即用，智能过滤 node_modules / dist / 二进制文件等 |

---

## 为什么需要这个工具？

假设你每天用 Claude 分析 10 次项目代码，每次 85,000 tokens：

```
不用缓存：$0.255 / 次 × 10 次 × 22 工作日 = $56.1 / 月
用缓存后：$0.026 / 次 × 10 次 × 22 工作日 = $5.7 / 月

每月节省：$50.4（省 90%）
```

**但缓存有一个前提：每次发给 AI 的内容必须完全一样。**

代码里只要有一行时间戳、一个 UUID、一个 Session ID，内容就会每次不同，缓存永远命中不了。

repo-compress 会在打包前扫描所有文件，把这些"定时炸弹"找出来告诉你。

---

## 🚀 快速开始

### Web 版（推荐）

**在线使用：**
```
https://mrcgq.github.io/repo-compress/
```

**本地运行：**

```bash
git clone https://github.com/mrcgq/repo-compress.git
cd repo-compress
npm install
npm run dev
```

打开浏览器访问 `http://localhost:5173`

**使用步骤：**
1. 选择输入方式：拖入 ZIP 文件，或切换到「远程仓库」输入 `owner/repo`
2. 选择输出格式（Claude 用 XML，ChatGPT 用 Markdown）
3. 点击「开始转换」
4. 复制结果，粘贴给 AI

### CLI 版（批量处理 / 自动化）

```bash
# 全局安装
npm install -g repo-compress

# 本地 ZIP 转换
repo-compress project.zip

# 直接获取远程仓库
repo-compress --remote facebook/react
repo-compress --remote vuejs/vue@main -f xml

# 指定格式和输出文件
repo-compress project.zip -f xml -o output.xml

# 只包含源码目录
repo-compress project.zip -i "src/**" -i "*.md"

# 查看详细统计
repo-compress project.zip --stats
```

---

## 📋 输出格式

| 格式 | 推荐 AI | 特点 |
|------|---------|------|
| **Markdown** | ChatGPT、Gemini | 代码高亮，人类可读性最强，通用首选 |
| **XML** | Claude | 边界清晰，Claude 官方推荐，大型项目首选 |
| **纯文本** | 所有 AI | 兼容性最强，体积最小 |

### Markdown 输出示例

````markdown
# 📦 Repository Content

## 📊 Statistics
- **Total Files**: 24
- **Total Size**: 148.48 KB
- **Estimated Tokens**: ~50,681

## 📁 Directory Structure

src/
├── core/
│   ├── converter.js
│   ├── detector.js
│   ├── filter.js
│   └── parser.js
└── web/
    ├── app.js
    ├── index.html
    └── styles.css

## 📄 File Contents

### `src/core/parser.js`

```javascript
// 文件内容...
```
````

### XML 输出示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<repository>
  <metadata>
    <includedFiles>24</includedFiles>
    <totalSize>152043</totalSize>
    <estimatedTokens>50681</estimatedTokens>
  </metadata>
  <files>
    <file path="src/core/parser.js" encoding="utf-8">
      <content><![CDATA[
        // 文件内容...
      ]]></content>
    </file>
  </files>
</repository>
```

---

## 🔍 缓存破坏检测

### 什么是缓存破坏？

Claude、GPT 的 Prompt Cache 要求每次发送的内容**完全一致**才能命中。代码里藏着的动态内容会让缓存每次都失效：

| 类型 | 示例 | 严重度 |
|------|------|--------|
| 时间戳 | `"2024-01-15T09:23:41Z"` | 🚨 HIGH |
| UUID | `"550e8400-e29b-41d4-a716-..."` | 🚨 HIGH |
| Session ID | `session_id: "abc123xyz"` | 🚨 HIGH |
| 用户 ID | `user_id: 12345` | ⚠️ MEDIUM |
| 环境变量 | `process.env.API_KEY` | ⚠️ MEDIUM |
| Git 哈希 | `commit: "a1b2c3d"` | ⚠️ MEDIUM |
| Agent 列表 | `agents: [...]` | ℹ️ LOW |
| 工具列表 | `tools: [...]` | ℹ️ LOW |

### 检测报告示例

```
🔍 缓存破坏检测详情

⚠️ 发现 2 个文件包含动态内容，可能导致 Prompt Cache 失效

🚨 HIGH
  src/config.js    → TIMESTAMP, SESSION
⚠️ MEDIUM  
  src/env.js       → ENV_VAR

💡 建议：
  🕒 1 个文件含时间戳，考虑移除或替换为固定占位符
  🔐 1 个文件含 Session ID，不应出现在缓存内容中
```

### 输出稳定性保证

repo-compress 对所有文件按**纯字母序**排序输出，保证每次生成的内容顺序完全一致。其他工具（如 Repomix）不保证这一点——顺序变化同样会导致缓存失效。

---

## 🔧 智能过滤

转换前自动排除以下内容，无需配置：

**依赖 & 包管理**
- `node_modules/`、`bower_components/`、`vendor/`

**版本控制**
- `.git/`、`.svn/`、`.hg/`

**构建产物**
- `dist/`、`build/`、`out/`、`.next/`、`.nuxt/`、`coverage/`

**编译产物**
- `*.min.js`、`*.min.css`、`*.bundle.js`、`*.map`

**二进制 & 媒体**
- 图片：`*.jpg`、`*.png`、`*.gif`、`*.webp`…
- 音视频：`*.mp4`、`*.mp3`、`*.wav`…
- 字体：`*.woff`、`*.woff2`、`*.ttf`…

**敏感文件**
- `.env`、`*.key`、`*.pem`（自动保护，不会打包进输出）

**编辑器 & IDE**
- `.vscode/`、`.idea/`、`.DS_Store`

---

## 🖥️ CLI 完整选项

```
用法:
  repo-compress <input.zip> [options]
  repo-compress --remote <owner/repo> [options]

输入来源（二选一）:
  <input.zip>                本地 ZIP 文件路径
  -r, --remote <owner/repo>  远程 GitHub 仓库（自动下载）
                             支持格式：
                               owner/repo
                               owner/repo@branch
                               https://github.com/owner/repo

选项:
  -f, --format <type>        输出格式 (markdown|xml|txt)  默认: markdown
  -o, --output <file>        输出文件路径
  -i, --include <pattern>    只包含匹配的文件（可多次使用）
  -e, --exclude <pattern>    排除匹配的文件（可多次使用）
  -t, --token <token>        GitHub Token（也可用 GITHUB_TOKEN 环境变量）
  --no-cache-detect          禁用缓存破坏检测
  --stats                    显示详细统计信息
  -h, --help                 显示帮助
  -v, --version              显示版本号

示例:
  repo-compress project.zip
  repo-compress project.zip -f xml -o output.xml
  repo-compress --remote facebook/react
  repo-compress --remote vuejs/vue@main -f xml --stats
  repo-compress --remote owner/repo -i "src/**" -i "*.md"
```

---

## 🛠️ 开发

### 项目结构

```
repo-compress/
├── src/
│   ├── core/              # 核心引擎（Web 和 CLI 共用）
│   │   ├── parser.js      # ZIP 解析，编码检测
│   │   ├── filter.js      # 文件过滤
│   │   ├── converter.js   # 格式转换（Markdown / XML / TXT）
│   │   └── detector.js    # 缓存破坏向量检测
│   ├── web/               # Web UI
│   │   ├── index.html
│   │   ├── app.js         # UI 逻辑，直接 import core 模块
│   │   └── styles.css
│   ├── cli/               # CLI
│   │   └── index.js
│   └── utils/
│       ├── constants.js   # 单一真相源：过滤规则、格式常量等
│       └── helpers.js
├── extension/             # Chrome 扩展
│   ├── manifest.json
│   ├── content.js         # GitHub 页面注入按钮
│   ├── background.js
│   └── popup.html / popup.js
├── test/
│   └── core.test.js       # 25 个测试，全部通过
└── package.json
```

### 开发命令

```bash
# 安装依赖
npm install

# 启动 Web 开发服务器
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build

# 运行 CLI（开发模式）
npm run cli -- project.zip
npm run cli -- --remote owner/repo
```

### 运行测试

```bash
npm test

# 预期输出：
# tests 25
# pass  25
# fail  0
```

---

## 与 Repomix 的区别

| | repo-compress | Repomix |
|---|---|---|
| 缓存破坏检测 | ✅ 自动检测 8 类向量 | ❌ 无 |
| 省钱估算 | ✅ 实时计算 | ❌ 无 |
| 输出顺序稳定 | ✅ 纯字母序，每次一致 | ⚠️ 不保证 |
| 远程仓库 | ✅ 直接输入 owner/repo | ✅ 支持 |
| 本地 ZIP 拖入 | ✅ 支持 | ⚠️ 部分支持 |
| 隐私（本地处理） | ✅ 完全本地 | ⚠️ 在线版上传 |
| Chrome 扩展 | ✅ GitHub 页面一键触发 | ❌ 无 |

---

## 许可证

[MIT](LICENSE)
```
