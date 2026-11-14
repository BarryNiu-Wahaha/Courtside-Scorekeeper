# CourtSide

- Read `README.md` and the latest session handoff in `docs/superpowers/plans/` before resuming work.
- Stack: vanilla JavaScript, Flask, MySQL for basketball records, and optional MongoDB for anonymous visitor activity.
- Check the current branch/worktree first. Visitor analytics lives on `feature/visitor-activity`; do not accidentally merge the separate readability refactor.
- Preserve existing game data, backups, CSVs, and unrelated changes. Never commit credentials or publish private analytics.
- Edit `src/` for the scorekeeper, then rebuild `Front.html` with `node build.cjs`. Hosted pages live in `site/`.
- Run relevant tests: `node --test tests/*.test.cjs` and `python -m unittest discover -s tests`. Use isolated databases for integration tests; report skips and known failures honestly.
- Keep session handoffs current. Deployment and paid services require explicit authorization.
- `simple ds` means use the readable-data-science skill; `grill me` means use the grilling skill.

## 当前进度（2026-11-13，部署中）

- 每个重要进度节点都更新本节，并同步根目录 AGENTS.md；不得写入密钥。
- 用户已明确授权访客功能合并 main、部署 Render/网站、开启采集并测试；未授权付费升级。
- 当前为访客功能工作目录，根目录仍是独立可读性重构分支，不要混合发布。
- MongoDB 专用数据库 `courtside_visitor` 已初始化，90 天保留索引及本机汇总查询验证通过。
- 已通过 85 项 JS 测试、57 项 Python 测试和访客浏览器端到端测试；31 项数据库测试本次跳过。已有 dashboard reduced-motion 问题未修复。
- 当前正在发布；尚不能认定线上采集已开启。下一步核对 Render 连接、发布前端、验证访问事件和管理员报表。
