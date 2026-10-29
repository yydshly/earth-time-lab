# 固定课程音频导出

该脚本为远端 Node 部署准备已有固定课程音频，原本机音频缓存保持原样。

在项目目录执行：

```powershell
node scripts/export-public-audio.mjs
```

默认输出目录为 `.release/public-audio/audio`。也可指定目录；相对路径按当前工作目录解析：

```powershell
node scripts/export-public-audio.mjs --out .release/deployment-audio/audio
```

脚本只读取 `dist` 中下列五份课程索引，并递归收集严格符合 `/audio/<64位十六进制>.mp3` 的引用：

- `tour-audio.json`
- `globe-lessons-audio.json`
- `routine-atlas-audio.json`
- `human-time-audio.json`
- `reset-time-audio.json`

只复制这些引用对应的 `.voice-cache` MP3，不复制缓存 JSON、其他动态音频、本机语音设置或环境文件。课程索引本身仍由项目的 `dist` 提供。输出目录中的 MP3 应由远端服务继续通过 `/audio/文件名.mp3` 提供，保留播放器所需的 Range 请求支持。

输出为文件数量、新复制数量、复用数量和总字节数，不打印配置、音频正文或本机绝对路径。

## 完整性与路径保护

- 所有索引、来源音频及已有同名输出文件先检查，再开始复制。缺失音频或索引格式错误时退出，返回非零状态码。
- 已有同名文件会用 SHA-256 校验；完全一致则复用，内容不同则报告冲突，绝不覆盖。
- 原缓存、`dist`、项目源码目录和项目祖先目录不能作为输出位置。项目内仅允许使用 `.release` 下的独立目录；项目外可使用明确指定的独立目录。
- 输出路径不能经过符号链接或目录联接，以免绕过路径保护。
- 脚本不删除输出目录或其中任何文件，也不会修改原缓存。磁盘写入失败等中途错误可能留下已成功复制的文件；修复问题后可重新运行，已存在且校验一致的文件会复用。

## 功能边界

固定课程音频不能覆盖所有实时生成的讲解。当前钟点、个人可用窗口、用户公告原文及部分导览讲解仍需要远端 Node 服务与受控的 MiniMax 接入。导出成功不代表纯静态站点与本机完整语音体验等价。
