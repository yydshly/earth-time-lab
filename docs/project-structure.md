# 项目结构与发布范围

本项目保留第一版已验证的目录结构。整理发布范围不等于清理本机数据；缓存、截图、日志和本机配置继续留在原处，只从源码提交和远端构建上下文中排除。

## 运行与源码

| 路径 | 作用 | 源码提交 |
| --- | --- | --- |
| `dist/` | 维护中的 HTML、CSS、ES modules、课程文案、音频清单和浏览器资产 | 保留 |
| `dist/vendor/` | 已打包随附的 Three.js 模块和 MIT 许可证 | 保留 |
| `dist/assets/` | NASA 地表图、陆地底图、时区数据及来源和许可说明 | 保留 |
| `public/audio/`、`public/recorded-voice.json` | 白名单公开音频与静态预录总索引 | 保留 |
| `scripts/` | 导出公开音频、准备预录、构建、校验和预览 Pages 产物 | 保留 |
| `.github/workflows/pages.yml` | 测试、检查、构建并部署静态 Pages，不生成语音 | 保留 |
| `server.mjs` | 本机 HTTP 页面、语音接口和音频范围请求 | 保留 |
| `minimax-service.mjs`、`minimax-transport.mjs` | 服务端 MiniMax 配置校验、合成与缓存、网络传输 | 保留 |
| `app-version-service.mjs` | 前端内容版本标识 | 保留 |
| `tests/` | Node.js 回归测试 | 保留 |
| `package.json`、`README.md` | 运行命令与使用说明 | 保留 |
| `generate-*.mjs`、`verify-*.mjs` | 课程语音准备与音频清单验证脚本 | 保留 |
| Windows 启停脚本 | 现有本机使用入口 | 保留 |

`dist/` 不是可以随意删除或忽略的临时构建产物；本项目目前没有另一份 `src/` 或从 `src/` 重建全部页面的流程。运行所需的 Three.js 在 `dist/vendor/`，不是依靠 `node_modules/` 在运行时提供。

生成脚本会调用已运行的本机语音服务，并更新相应课程清单；生成新语音可能使用 MiniMax 账户额度。验证脚本读取清单与实际音频，其中音频格式和时长验证需要本机 `ffprobe`。部署不应自动运行整套语音生成命令。

## 只在本机保留的内容

- `.env*`、`.voice-settings.json`：真实密钥与本机配置；只有不含密钥的 `.env.example` 允许提交。
- `.voice-cache/`：生成的 MP3 与元数据，可能包含公告原文、个人时间和其他动态输入。
- `screenshots/`、根目录审计 HTML 和评审 Markdown：开发检查产物。
- `*.log`、`*.pid`、`*.tmp`、`voice-check.json`：运行和检查输出。
- `.vercel/`、`.netlify/`、`.wrangler/` 等：部署账号关联或私密状态。

`.gitignore` 和 `.dockerignore` 负责排除这些内容，并不删除本机文件。提交前仍应检查实际待提交列表，不能只依赖文件名规则判断内容是否适合发布。

## 公开预录音频与动态缓存

下列音频清单描述固定教学内容，作为前端源码的一部分提交：

- `dist/tour-audio.json`
- `dist/globe-lessons-audio.json`
- `dist/human-time-audio.json`
- `dist/routine-atlas-audio.json`
- `dist/reset-time-audio.json`

公开预录版从这些固定清单、课程实际讲稿、导览和 `dist/recorded-narrations.mjs` 的通用读屏讲稿建立白名单。`scripts/prepare-recorded-voice.mjs` 将对应 MP3 核验后放入 `public/audio/`，并生成 `public/recorded-voice.json`，按文本 SHA-256 查找已发布片段。索引和白名单音频随仓库提交，普通构建不需要 MiniMax 配置。不可把整个 `.voice-cache/` 批量上传；其他音频可能来自动态或个人输入，白名单数量会随公开讲稿更新。

`scripts/build-pages.mjs` 将源码和白名单资源组装到 `.release/site/`，注入预录模式标记、调整子路径并校验发布内容。在线版和静态预览都只读取音频，不需要语音 API：固定课程播放固定内容，变化的日期、钟点和个人设置由画面实时计算，语音使用通用读屏讲解。缺少片段时明确提示，不在运行时生成。

本机 `npm start` 仍保留可选动态讲解，由本地服务读取私有配置并处理合成；真实密钥不得进入 `dist/`、`public/`、浏览器代码、Git 历史或公开构建资产。本机服务对监听地址、Host 和 Origin 有本机限定；GitHub Pages 发布静态产物，不暴露这个本机服务。使用命令见根目录 `README.md`。

## 第三方资产

第三方资产及现有许可说明见根目录 `THIRD_PARTY_NOTICES.md`。整理源码不会替项目所有者选择开源许可证，也不改变第三方数据的原有许可。
