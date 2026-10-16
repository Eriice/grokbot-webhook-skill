# grokbot-webhook：让任意 agent 调用 Grok Bot

装好以后，Claude Code、Codex、Cursor、Gemini CLI 等 agent 都可以把查 X 公开推文的任务交给你电脑上的 Grok Bot。

这个 skill 只用于读 X 上的**公开**内容（帖子、讨论串、公开账号、搜索），不读收藏、私信、Following 时间线等需要登录你账号才能看到的数据。

安装是一条命令；之后的一次性配置可以直接在 agent 的会话里让它带你做。

## 准备
- 一台 Mac，已装好并登录 **Grok Bot 桌面版**（不需要连接你自己的 X 账号）。
- **Node.js 22.18 或更高版本**。在终端运行 `node --version` 查看；版本太低或没有，就到 https://nodejs.org 下载 LTS 版安装。

## 第 1 步：安装 skill
在终端运行：
```bash
npx skills add Eriice/grokbot-webhook-skill -g
```
按提示选择要安装到哪些 agent（Claude Code、Codex、Cursor、Gemini CLI 等）。skill 会装在 `~/.agents/skills/grokbot-webhook`，
其他 agent 通过链接共用这一份。以后更新运行 `npx skills update grokbot-webhook`。

**确认成功**：最后显示 `Installed 1 skill` 和 `~/.agents/skills/grokbot-webhook`。

## 第 2 步：在会话里让 agent 带你配置
打开任意一个已安装了这个 skill 的 agent，输入：

- Claude Code：`/grokbot-webhook 帮我完成首次配置`
- 其他 agent：`用 grokbot-webhook skill 帮我完成首次配置`

agent 会一步步带你：检查前提条件、在 Grok Bot 里新建 webhook routine（它会把要粘贴的指令直接给你）、
保存地址和密钥、最后发一条 pong 测试。

其中只有**保存密钥**这一步要你在自己的终端里运行一条命令（agent 会告诉你是哪条）。
这是有意的：密钥不应该出现在对话记录里，所以不让 agent 替你输入。

## 第 3 步：使用
配置好以后，在任意 agent 里直接用自然语言说：
- 「让 Grok Bot 搜一下 X 上最近一周关于 Claude Code skills 的讨论」
- 「让 Grok Bot 取 @某账号 最新的 20 条帖子，存成 posts.jsonl」

## 附：手动配置
不想让 agent 带着做，也可以自己按下面的步骤操作，效果相同。

为了方便，先在终端运行下面这行，之后就可以用 `grokbot` 代替完整命令（只对当前终端窗口有效，关掉后重新运行即可）：
```bash
alias grokbot="node $HOME/.agents/skills/grokbot-webhook/scripts/grokbot.ts"
```

### ① 在 Grok Bot 里新建 routine
1. 在终端运行 `grokbot instructions`，复制它输出的整段文字。
2. 打开 Grok Bot 桌面版，新建一个 routine：
   - 名字随意，例如「Agent 任务收件」。
   - 触发方式选 **Webhook**。
   - 指令（instructions）栏粘贴第 1 小步复制的文字。
3. 保存。

**确认成功**：routine 页面上能看到 webhook 地址和认证信息（形如 `Authorization: Bearer xxx`）。
如果点开 routine 看不到这个页面，可以在 Grok Bot 聊天里说「给我这个 routine 的 Webhook URL 链接」。

### ② 把地址和密钥交给脚本
在终端运行 `grokbot setup`，按提示依次粘贴：
1. webhook 地址；
2. 认证信息：直接粘贴 Grok Bot 给的整行，例如 `Authorization: Bearer xxx`（只复制到密钥也可以；输入时屏幕不会显示，粘贴后回车即可）。

**确认成功**：运行 `grokbot status`，显示「配置: 已设置」。

密钥只保存在你电脑上的 `~/.grokbot-webhook/config.json`，只有你的账号能读。不要把它贴到任何聊天里。

### ③ 测试一次
```bash
RID=$(grokbot send --task "只回复一个词：pong")
grokbot wait "$RID"
```
第一次运行时，Grok Bot 会请求在你电脑上执行 reply 命令，请选择允许（可以选「总是允许」这条命令）。

**确认成功**：终端打印出 `pong`。
- 提示 HTTP 401 或 403：密钥或 header 名称不对，重新做 ②。
- 等待超时：看看 Grok Bot 里这个 routine 有没有运行、是否卡在授权请求上。不要重复发送，再运行一次 `grokbot wait "$RID"` 即可。

## 常见问题
- **电脑要一直开着吗？** 任务执行期间要开着，且 Grok Bot 在运行，否则答案写不回来。
- **会花钱吗？** 每次任务都会消耗 Grok Bot 的额度，具体以 Grok Bot 的计费为准。大批量前先小批量试。
- **能导出我的收藏吗？** 不在这个 skill 的范围内。Grok Bot 没有以你的身份登录 X，读收藏这类私有数据会返回 `ERROR:`。
- **卸载**：运行 `npx skills remove grokbot-webhook -g`，再删除 `~/.grokbot-webhook`，并在 Grok Bot 里删除这个 routine。
