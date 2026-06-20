# Codex Account Switcher

[English README](README.md)

一个可移植的 Codex 账号登录态切换工具。它可以把当前登录态保存成 profile，也可以导入已有 JSON，然后通过 profile 或编号 slot 切换账号；如果切换出错，还可以回滚到备份。

## 为什么需要它

Codex 的本地登录状态通常存在 `auth.json` 里。如果你在同一台机器上使用多个 Codex 账号，手动替换登录态很麻烦，也容易把错误的 JSON 覆盖掉。这个 skill 把流程收敛成一个本地 CLI，并遵守三条规则：

- 登录凭证只留在本地磁盘；
- 每次切换前都会自动备份；
- 命令输出只显示非敏感摘要，不打印 token 或完整 JSON。

## 功能

- 把当前 Codex 登录态保存成可复用 profile。
- 导入普通 Codex `auth.json` 或 CPA 风格 JSON。
- 给 profile 绑定数字 slot，然后按编号切换。
- 准备手动登录 slot，用于重新登录并刷新已失效 profile。
- 切换失败后可回滚到最新备份或指定备份。
- 使用临时 `CODEX_HOME` 跑隔离测试，不影响真实登录。
- 提供 `references/onboarding.md`，运行时如果有 ask-user-question 工具，可以作为新手引导问题集。

## 前置条件

- Codex 使用本地 `auth.json` 登录态。
- Node.js 18 或更新版本。
- 终端对 Codex 配置目录有读写权限。

## 安装

把 skill 克隆到 Codex skills 目录：

```bash
git clone https://github.com/scratchy1234/codex-account-switcher \
  ~/.codex/skills/codex-account-switcher
```

如果安装在其他位置，设置环境变量：

```bash
export CODEX_ACCOUNT_SWITCHER_SKILL_DIR="/path/to/codex-account-switcher"
```

验证安装：

```bash
cd ~/.codex/skills/codex-account-switcher
./scripts/run-tests.sh
node scripts/codex-account-switcher.mjs doctor
```

## 快速开始

保存当前 Codex 已登录账号：

```bash
node scripts/codex-account-switcher.mjs capture work-main --slot 1 --dry-run
node scripts/codex-account-switcher.mjs capture work-main --slot 1
```

导入另一个保存好的 JSON：

```bash
node scripts/codex-account-switcher.mjs import-auth-json backup-account ./auth.json --slot 2 --dry-run
node scripts/codex-account-switcher.mjs import-auth-json backup-account ./auth.json --slot 2
```

查看账号列表：

```bash
node scripts/codex-account-switcher.mjs list
```

切换到某个 profile 或 slot：

```bash
node scripts/codex-account-switcher.mjs switch --dry-run 1
node scripts/codex-account-switcher.mjs switch 1
```

如果当前登录态可能已经坏了，不要把它同步回 profile：

```bash
node scripts/codex-account-switcher.mjs switch --no-sync <known-good-profile-or-slot>
```

## 恢复与重新登录

查看备份：

```bash
node scripts/codex-account-switcher.mjs backups
```

回滚：

```bash
node scripts/codex-account-switcher.mjs rollback --dry-run latest
node scripts/codex-account-switcher.mjs rollback latest
```

准备手动登录刷新：

```bash
node scripts/codex-account-switcher.mjs login-slot --dry-run 1
node scripts/codex-account-switcher.mjs login-slot 1
```

登录完成后，执行 CLI 输出的 `after_login=...` 命令。对于已有 slot，这条命令会自动带上 `--replace`，用于把新登录态覆盖回原 profile。

## 存储结构

默认状态目录在 `CODEX_HOME` 下，通常是 `~/.codex`：

```text
~/.codex/
├── auth.json                         # 当前 Codex 登录态
└── account-switcher/
    ├── profiles/                     # 保存的 profile 登录态
    ├── backups/                      # 切换前自动备份
    ├── profiles.json                 # profile 与 slot 映射
    ├── active-profile                # 最近切换到的 profile
    └── last-backup                   # 最新回滚目标
```

测试时建议使用临时 `CODEX_HOME`：

```bash
CODEX_HOME="$(mktemp -d)" node scripts/codex-account-switcher.mjs doctor
```

## 安全边界

- 不要把 token、cookie、API key、auth header、完整 env 或完整 `auth.json` 粘贴到聊天里。
- 导入 JSON 时只提供本地文件路径。
- 覆盖 profile、切换账号、准备登录 slot、回滚之前，优先跑 `--dry-run`。
- 至少保留一个已知可用 profile 或备份。
- 切换后如果 Codex 进程仍保留旧登录态，需要手动重启 Codex。

## 命令参考

```text
codex-account-switcher init
codex-account-switcher doctor
codex-account-switcher list
codex-account-switcher current
codex-account-switcher capture <profile> [--slot <number>] [--replace] [--dry-run]
codex-account-switcher import-auth-json <profile> <json-file-or-folder> [--slot <number>] [--replace] [--dry-run]
codex-account-switcher switch [--no-sync] [--dry-run] <profile-or-slot>
codex-account-switcher login-slot [--dry-run] <profile-or-slot>
codex-account-switcher backups
codex-account-switcher rollback [--dry-run] [latest|backup-path]
codex-account-switcher path
codex-account-switcher questions
```

## FAQ

**会上传登录态吗？**

不会。它只读写本地文件。

**能自动刷新过期登录态吗？**

不能。如果服务方让 token 失效，需要你手动登录，再重新 capture。

**`--no-sync` 是什么？**

它会跳过“把当前 live auth 同步回已保存 profile”这一步。当前登录态可能损坏或过期时，用它来恢复到已知可用账号。

**能不影响真实 Codex 登录来测试吗？**

可以。运行前把 `CODEX_HOME` 指到临时目录。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=scratchy1234/codex-account-switcher&type=Date)](https://star-history.com/#scratchy1234/codex-account-switcher&Date)

## License

MIT
