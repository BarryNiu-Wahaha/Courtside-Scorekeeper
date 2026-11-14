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
- 访客功能已快进合并 GitHub main，Render 已部署 `47aa4ec`。后端采集配置为 true，但公开网站尚未发布新版脚本，实际采集尚未开启。
- 用户已将 Render 出口范围加入 Atlas：Render 到 MongoDB 汇总查询现已成功，当前 0 次访问。
- 新阻塞点：网站发布接口和球员名单接口返回 503；本机连接原有 Aiven MySQL 失败（2003），其域名解析失败（11001）。已请用户在 Aiven 控制台检查并恢复原 MySQL 服务，或确认连接地址变更。尚不能断言服务被暂停或删除。
- 公开网站尚未发布新版访客采集脚本，不能报告已开始收集。恢复 MySQL 后先验证名单接口，再 publish、verify 和受控浏览器访问。
- 用户添加网络规则后，从根目录运行私有 `.local/visitor_release.py check`；成功后才 publish、verify，再让用户测试球员查看。不得输出私有配置。
