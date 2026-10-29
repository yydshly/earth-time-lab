# GitHub Pages 预录版部署

远端版本通过 GitHub Pages 提供页面、地图和已准备的 MiniMax 录音，不需要运行 Node 服务，也不在访问时生成语音。所有实时钟点、换算与个人窗口仍由页面计算；预录讲解说明理解方法，具体数字以画面为准。本机 `npm start` 继续使用原有完整服务模式。

## 发布输入

- `dist/`：页面、模块、样式、地图、贴图、许可证，以及五份固定课程音频索引。
- `public/recorded-voice.json`：公开预录清单，格式为 `{version:1,model,voiceId,region,recordings:[{id,textHash,audioUrl,durationMs,...}]}`。
- `public/audio/`：五份课程索引及预录清单引用的 MP3；只导出已确认的固定课程和通用说明，不发布整个本机缓存。

发布不需要 MiniMax API 密钥、云平台令牌或其他配置文件。`.voice-cache`、`.voice-settings.json`、环境文件和未引用音频不是构建输入。五份课程索引为 `tour-audio.json`、`globe-lessons-audio.json`、`routine-atlas-audio.json`、`human-time-audio.json`、`reset-time-audio.json`。

## 本机构建与验证

需要 Node.js 22 或更新的兼容版本。项目没有额外运行时 npm 依赖：

```powershell
npm test
npm run check
npm run build:pages
npm run verify:pages
```

输出位于 `.release/site`。可以指定项目 `.release` 下的其他独立目录：

```powershell
node scripts/build-pages.mjs --out .release/site-preview
node scripts/build-pages.mjs --verify --out .release/site-preview
```

构建先核对全部音频引用，再写输出。缺失音频、无效清单、机器绝对路径或私有配置字段会使构建失败。相同输出可重复构建；已有构建文件可以更新，但脚本不递归删除目录，也不修改 `dist`、`public` 或原缓存。输出目录中存在本次构建之外的文件时会停止并保留它们；应选一个新的 `.release` 子目录或先人工核对旧文件。符号链接、目录联接和输出硬链接均被拒绝。

构建仅在输出 HTML 中注入 `time-atlas-deployment=recorded` 标记和“预录讲解，具体数字以画面为准”说明。本机源 HTML 保持原样。课程索引中的 `/audio/...` 转成 `./audio/...`，完整 MP3 字面量也按相对路径发布；语音 API 由预录适配器在浏览器中处理。版本检查改为相对 `./app-version.json`，版本号由实际发布内容哈希计算，重复构建相同输入得到相同版本。

相对资源路径使 `https://yydshly.github.io/earth-time-lab/` 这样的项目子路径可用。不要把项目放在只能通过 `file://` 打开的目录中测试；使用静态 HTTP 服务查看 `.release/site`，并检查项目子路径下的地球、课程录音、公告换算与导览。

## GitHub 配置

1. 创建公开仓库并推送 `main`，保留 `dist`、公开录音、源代码、测试和本工作流。
2. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
3. 推送 `main` 或手动运行 **Publish GitHub Pages**。
4. 工作流依次测试、检查、构建、验证、上传 `.release/site`，再部署到 `github-pages` 环境。部署网址由 Actions 输出。

工作流仅使用 GitHub 自动提供的 `GITHUB_TOKEN` 与 Pages OIDC 权限，无需个人令牌。公开构建阶段只读仓库与 Pages 元数据；部署阶段才有 `pages: write` 和 `id-token: write`。官方 Actions 固定到核对过的提交 SHA，旁边记录版本号。

部署完成后应在最终远端地址检查录音播放、暂停、分段和完整导览的自然推进。GitHub Pages 是公开静态发布，不接收或保存 MiniMax 密钥，也不替用户确认产品实际额度重置政策。

官方说明：[Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[configure-pages](https://github.com/actions/configure-pages)、[upload-pages-artifact](https://github.com/actions/upload-pages-artifact)、[deploy-pages](https://github.com/actions/deploy-pages)。
