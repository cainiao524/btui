# BT Next UI（统一源码仓）

qBittorrent Next UI 与 Transmission VibeMod 的唯一源码仓库。界面只写一次，构建时选择后端。

| 后端 | 发布仓库 | Docker 镜像 |
|---|---|---|
| qBittorrent | [cainiao524/qbittorrent-next-ui](https://github.com/cainiao524/qbittorrent-next-ui) | `lowsabishi/qbittorrent-next-ui` |
| Transmission | [cainiao524/transmission-next-vibemod](https://github.com/cainiao524/transmission-next-vibemod) | `lowsabishi/transmission-next-vibemod` |

用户安装说明见各发布仓库的 README（源文件在 `backends/<后端>/repo/README.md`）。

## 目录

```
src/                     共享界面、hooks、通用工具
backends/qbittorrent/    qBittorrent Web API 适配层
backends/transmission/   Transmission RPC 适配层
  rpc-client.ts            通信层（界面只调用这里导出的 rpc）
  rpc-client-mock.ts       demo 模式的模拟数据
  columns.ts               列表列定义
  application-preferences*.ts  「全部设置」的分类、排序、标签、依赖、只读
  config.ts                名称、版本、存储 key、事件名、备份格式
  locales/*.json           覆盖共享文案中带后端名词的部分
  toolbar-tools.tsx        后端专属的工具菜单项
  release.json             发布元数据（仓库名、标签后缀、staging 包名）
  repo/                    该发布仓库专属文件（README、Dockerfile、compose、nginx 模板）
release/workflows/       发布仓库 workflow 模板
scripts/release.mjs      生成发布树、同步发布仓库
```

共享代码用 `@backend/<模块>` 引用后端适配层。新增后端专属能力时，在每个后端都导出同名模块（不支持的后端导出空实现），两个后端各自 typecheck，缺一个就会报错。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm dev:qb            # 或 pnpm dev:tr
pnpm lint && pnpm typecheck && pnpm test && pnpm build:all
```

不连后端的 demo：`node scripts/with-backend.mjs transmission "vite --mode demo"`。

## 发布

发版只需要一次确认：合并改版本号的 PR。

1. `pnpm release 1.20.0` 改写两个后端的版本号，提交并开 PR。热修单个后端：`pnpm release 1.20.0-1 --only transmission`。
2. 合并这个 PR。之后全自动：
   - 本仓库「同步到发布仓库」跑完两个后端的检查，为还没发布该版本的发布仓库开同步 PR；
   - 等发布仓库的检查通过后自动 squash merge；
   - 发布仓库的 `auto-release.yml` 打标签（`vX.Y.Z-funky9` / `vX.Y.Z-baka9`），调起 `docker-image.yml` 推送 Docker Hub、GHCR 并创建 Release。

任一步失败都会停下，不会只发一半。不改版本号的合并不会触发发布。

需要在本仓库配置 `SYNC_TOKEN`：只授权两个发布仓库的 fine-grained PAT，权限为 Contents、Pull requests、Workflows 读写。配好后在 Actions 运行「令牌自检（SYNC_TOKEN）」：默认只读，不改动发布仓库；勾选 `full` 会在每个发布仓库推临时分支、开草稿 PR，验证三项写权限，之后自动关闭并删除，不触发构建或发布。

第一次同步会改动发布仓库的整体结构，所以只开草稿 PR，需要人工审阅后合并。手动同步可在 Actions 运行「同步到发布仓库」，或在本地运行 `pnpm release --open-pr`（使用已登录的 gh CLI）。`pnpm release` 不带 `--open-pr` 时只在本地生成 `release-out/`，不会推送任何东西。
