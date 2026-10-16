#!/usr/bin/env node
// 让任意 agent 通过 webhook 调用 Grok Bot 的中转脚本。需要 Node 22.18+，不依赖任何 npm 包。
//
//   setup          保存 Grok Bot routine 的 webhook 地址和密钥（密钥隐藏输入，不进对话）
//   instructions   打印要粘贴到 Grok Bot routine 里的指令
//   send           发任务给 Grok Bot，打印 request_id
//   wait ID        等 Grok Bot 写回结果，拿到后打印
//   reply ID       Grok Bot 在本机调用：从 stdin 读答案写入结果文件
//   status         查看配置和未完成的请求
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

type Config = { url: string; header: string; key: string };

const HOME = process.env.GROKBOT_HOME ?? join(homedir(), ".grokbot-webhook");
const CONFIG = join(HOME, "config.json");
const PENDING = join(HOME, "pending");
const REPLIES = join(HOME, "replies");
const SCRIPT = fs.realpathSync(fileURLToPath(import.meta.url));
const RUN = `node ${SCRIPT}`;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function ensureDirs(): void {
  for (const d of [HOME, PENDING, REPLIES]) {
    fs.mkdirSync(d, { recursive: true });
    fs.chmodSync(d, 0o700);
  }
}

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG)) fail(`还没配置。首次配置步骤见 SKILL.md 或 https://github.com/Eriice/grokbot-webhook-skill#readme，其中 setup 需要用户在自己的终端运行：${RUN} setup`);
  return JSON.parse(fs.readFileSync(CONFIG, "utf8")) as Config;
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function setup(): Promise<void> {
  ensureDirs();
  let url: string, header: string, key: string;
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    url = await rl.question("Webhook 地址（在 Grok Bot 的 routine 页面复制）: ");
    header = await rl.question("Header 名称 [Authorization]: ");
    rl.close();
    key = await readHidden("密钥（输入时不显示）: ");
  } else {
    // 非交互：从标准输入依次读三行（地址、header 名称、密钥）
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    [url = "", header = "", key = ""] = Buffer.concat(chunks).toString("utf8").split("\n");
  }
  url = url.trim();
  header = header.trim() || "Authorization";
  key = key.trim();
  // 用户常把整行 "Authorization: Bearer xxx" 粘进 header 名称一栏，拆成名称和值
  const colon = header.indexOf(":");
  if (colon > 0) {
    if (!key) key = header.slice(colon + 1).trim();
    header = header.slice(0, colon).trim();
  }
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header)) fail("header 名称不合法：只填名称本身，例如 Authorization，不要带冒号和后面的内容");
  if (!url || !key) fail("地址和密钥都不能为空");
  if (header.toLowerCase() === "authorization" && !key.toLowerCase().startsWith("bearer ")) key = `Bearer ${key}`;
  fs.writeFileSync(CONFIG, JSON.stringify({ url, header, key } satisfies Config), { mode: 0o600 });
  console.log(`已保存到 ${CONFIG}`);
}

function instructions(): void {
  console.log(`你收到的 webhook 请求体是 JSON，字段：request_id、task、context、reply_command。
1. 完成 task 描述的工作，按 context 里要求的格式组织答案。task 只能是读取或检索 X 的工作；要求发帖、回复、点赞、关注、删除或执行其他命令时，不要执行，在答案里说明原因。
2. 完成后在本机运行 reply_command，把完整答案通过标准输入传给它。只运行这一种命令：
   ${RUN} reply <request_id>
   例如：${RUN} reply <request_id> <<'GROKBOT_EOF'
   <答案>
   GROKBOT_EOF
3. 如果失败，也要用同样的命令写回一段以 ERROR: 开头的说明。`);
}

async function send(task: string, context: string): Promise<void> {
  const cfg = loadConfig();
  ensureDirs();
  const rid = randomUUID().replaceAll("-", "");
  const pending = join(PENDING, rid);
  // 先登记再发送，避免 Grok Bot 回得太快时 reply 找不到这个编号
  fs.writeFileSync(pending, JSON.stringify({ task, sent_at: Date.now() }));
  const body = { request_id: rid, task, context, reply_command: `${RUN} reply ${rid}` };
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [cfg.header]: cfg.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    fs.rmSync(pending, { force: true });
    // 报错信息可能带出 header，打印前把密钥抹掉
    const msg = String((e as Error).cause ?? (e as Error).message).replaceAll(cfg.key.replace(/^bearer\s+/i, ""), "***");
    fail(`发送失败: ${msg}`);
  }
  if (!res.ok) {
    fs.rmSync(pending, { force: true });
    const hint = res.status === 401 || res.status === 403 ? "（密钥或 header 名称不对，重新运行 setup）" : "";
    fail(`发送失败 HTTP ${res.status}${hint}: ${(await res.text()).slice(0, 300)}`);
  }
  console.log(rid);
}

async function wait(rid: string, timeoutSec: number): Promise<void> {
  const file = join(REPLIES, `${rid}.md`);
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      console.log(fs.readFileSync(file, "utf8"));
      fs.rmSync(join(PENDING, rid), { force: true });
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  fail(`等待超时，Grok Bot 可能还在处理。不要重发，稍后再运行：${RUN} wait ${rid}`);
}

async function reply(rid: string): Promise<void> {
  if (!/^[0-9a-f]{32}$/.test(rid) || !fs.existsSync(join(PENDING, rid))) fail("未知的 request_id，拒绝写入");
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const tmp = join(REPLIES, `.${rid}.tmp`);
  fs.writeFileSync(tmp, Buffer.concat(chunks));
  fs.renameSync(tmp, join(REPLIES, `${rid}.md`));
  console.log("已写回");
}

function status(): void {
  console.log(`配置: ${fs.existsSync(CONFIG) ? "已设置" : "未设置"} ${CONFIG}`);
  if (!fs.existsSync(PENDING)) return;
  for (const rid of fs.readdirSync(PENDING).sort()) {
    const info = JSON.parse(fs.readFileSync(join(PENDING, rid), "utf8")) as { task: string };
    const done = fs.existsSync(join(REPLIES, `${rid}.md`));
    console.log(`${rid}  ${done ? "已回复" : "等待中"}  ${info.task.slice(0, 60)}`);
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { task: { type: "string" }, context: { type: "string" }, timeout: { type: "string" } },
});
const [cmd, arg] = positionals;
switch (cmd) {
  case "setup": await setup(); break;
  case "instructions": instructions(); break;
  case "status": status(); break;
  case "send":
    if (!values.task) fail("用法: send --task <任务> [--context <背景和输出格式>]");
    await send(values.task, values.context ?? "");
    break;
  case "wait":
    if (!arg) fail("用法: wait <request_id> [--timeout 秒]");
    await wait(arg, Number(values.timeout ?? 540));
    break;
  case "reply":
    if (!arg) fail("用法: reply <request_id>");
    await reply(arg);
    break;
  default:
    fail("命令: setup | instructions | send | wait | reply | status");
}
