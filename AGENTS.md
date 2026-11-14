# CourtSide

- Read `README.md` and the latest session handoff in `docs/superpowers/plans/` before resuming work.
- Stack: vanilla JavaScript, Flask, MySQL for basketball records, and optional MongoDB for anonymous visitor activity.
- Check the current branch/worktree first. Visitor analytics lives on `feature/visitor-activity`; do not accidentally merge the separate readability refactor.
- Preserve existing game data, backups, CSVs, and unrelated changes. Never commit credentials or publish private analytics.
- Edit `src/` for the scorekeeper, then rebuild `Front.html` with `node build.cjs`. Hosted pages live in `site/`.
- Run relevant tests: `node --test tests/*.test.cjs` and `python -m unittest discover -s tests`. Use isolated databases for integration tests; report skips and known failures honestly.
- Keep session handoffs current. Deployment and paid services require explicit authorization.
- `simple ds` means use the readable-data-science skill; `grill me` means use the grilling skill.

## 当前进度（2026-11-13，访客分析已上线）

- 每个重要进度节点都更新本节，并同步根目录 AGENTS.md；不得写入密钥。
- 用户已明确授权访客功能合并 main、部署 Render/网站、开启采集并测试；未授权付费升级。
- 当前为访客功能工作目录，根目录仍是独立可读性重构分支，不要混合发布。
- MongoDB 专用数据库 `courtside_visitor` 已初始化，90 天保留索引及本机汇总查询验证通过。
- 已通过 85 项 JS 测试、57 项 Python 测试和访客浏览器端到端测试；31 项数据库测试本次跳过。已有 dashboard reduced-motion 问题未修复。
- 访客功能已合并 GitHub main，Render 应用版本为 `47aa4ec`；Cloudflare 已发布 revision 23，公开配置 visitorTrackingEnabled=true。后续提交仅更新文档。
- Render 到 MongoDB 查询已验证；受控真实浏览器访问成功产生 1 次访问、1 次页面打开和 1 次球员查看，初始计数包含这次测试。未将真实访客明细提交到 GitHub。
- Aiven 官方 2026-11-06 公告确认 MySQL 免费层停止新建，2026-12-21 将停服并删除数据和云端备份。不要再建议新建免费 Aiven MySQL。优先恢复旧服务并导出最新数据；本地 9 月 SQL 备份早于后续修正，不能视为最新。迁移方案尚未确定，付费升级未授权。来源：https://aiven.io/docs/products/mysql/howto/mysql-free-tier-migration-options
- Aiven 原服务已恢复，MySQL 连接及线上名单接口正常。最新 SQL 备份位于根目录 `.local/database-backups/20261114T033215Z`，4,117,761 字节，含 10 场比赛和 37 个球员记录；导出完整性及导出前后表校验通过，尚未对这份新备份执行隔离恢复测试。
- 发布后核对公开 games/roster 与发布前一致；匿名读取访客报表返回 401。用户现在可打开网站点击球员，再在 admin.html → Visitor activity 刷新查看。
- 后续重点：用户验收、观察实际采集量，并在 Aiven 2026-12-21 退休日前确定篮球数据库迁移方案。根目录私有 `.local/visitor_release.py check` 可核对汇总；不要重复受控访问污染计数，不得输出私有配置。
