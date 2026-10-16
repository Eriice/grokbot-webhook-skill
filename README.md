# grokbot-webhook：让任意 agent 调用 Grok Bot

装好以后，Claude Code、Codex、Cursor、Gemini CLI 等 agent 都可以把查 X、读收藏的任务交给你电脑上的 Grok Bot。

安装只需要第 1 步的一条命令；第 2 到 4 步是一次性配置 Grok Bot。整个过程共 5 步，每一步都有「怎么确认成功」。卡在哪一步，把屏幕上的提示发给 agent 即可。

## 准备
- 一台 Mac，已装好并登录 **Grok Bot 桌面版**，且已连接你的 X 账号。
- **Node.js 22.18 或更高版本**。在终端运行 `node --version` 查看；版本太低或没有，就到 https://nodejs.org 下载 LTS 版安装。

## 第 1 步：安装 skill
在终端运行：
```bash
npx skills add Eriice/grokbot-webhook-skill -g
```
按提示选择要安装到哪些 agent（Claude Code、Codex、Cursor、Gemini CLI 等）。skill 会装在 `~/.agents/skills/grokbot-webhook`，
其他 agent 通过链接共用这一份。以后更新运行 `npx skills update grokbot-webhook`。

**确认成功**：最后显示 `Installed 1 skill` 和 `~/.agents/skills/grokbot-webhook`。

为了方便，先在终端运行下面这行，之后就可以用 `grokbot` 代替完整命令（只对当前终端窗口有效，关掉后重新运行即可）：
```bash
alias grokbot="node $HOME/.agents/skills/grokbot-webhook/scripts/grokbot.ts"
```

## 第 2 步：在 Grok Bot 里新建 routine
1. 在终端运行 `grokbot instructions`，复制它输出的整段文字。
2. 打开 Grok Bot 桌面版，新建一个 routine：
   - 名字随意，例如「Agent 任务收件」。
   - 触发方式选 **Webhook**。
   - 指令（instructions）栏粘贴第 1 小步复制的文字。
3. 保存。

**确认成功**：routine 页面上能看到 webhook 地址、header 名称和密钥。
如果点开 routine 看不到这个页面，可以在 Grok Bot 聊天里说「给我这个 routine 的 Webhook URL 链接」。

## 第 3 步：把地址和密钥交给脚本
在终端运行 `grokbot setup`，按提示依次粘贴：
1. webhook 地址；
2. header 名称（页面上写的是 Authorization 就直接回车）；
3. 密钥（输入时屏幕不会显示，粘贴后回车即可）。

**确认成功**：运行 `grokbot status`，显示「配置: 已设置」。

密钥只保存在你电脑上的 `~/.grokbot-webhook/config.json`，只有你的账号能读。不要把它贴到任何聊天里。

## 第 4 步：测试一次
```bash
RID=$(grokbot send --task "只回复一个词：pong")
grokbot wait "$RID"
```
第一次运行时，Grok Bot 会请求在你电脑上执行 reply 命令，请选择允许（可以选「总是允许」这条命令）。

**确认成功**：终端打印出 `pong`。
- 提示 HTTP 401 或 403：密钥或 header 名称不对，重新做第 3 步。
- 等待超时：看看 Grok Bot 里这个 routine 有没有运行、是否卡在授权请求上。不要重复发送，再运行一次 `grokbot wait "$RID"` 即可。

## 第 5 步：在 agent 里使用
打开任意一个 agent（例如在项目目录里启动 Claude Code），直接用自然语言说：
- 「让 Grok Bot 搜一下 X 上最近一周关于 Claude Code skills 的讨论」
- 「让 Grok Bot 读我最新的 100 条收藏，存成 bookmarks.jsonl」

agent 会自动调用这个 skill。

## 常见问题
- **电脑要一直开着吗？** 任务执行期间要开着，且 Grok Bot 在运行，否则答案写不回来。
- **会花钱吗？** Grok Bot 读帖子走你 X 开发者账号的额度，大约每条 $0.005（来自网上的教程，未核实）。大批量前先小批量试。
- **卸载**：运行 `npx skills remove grokbot-webhook -g`，再删除 `~/.grokbot-webhook`，并在 Grok Bot 里删除这个 routine。
