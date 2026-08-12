# Findings

- 线上 202 个 Codex 账号中 `expires_at < imported_at` 为 0 条；截图账号是 8 月 12 日导入、9 月 12 日订阅到期，根因是“过期时间”文案容易被误解，改为“订阅到期时间”。
- 线上全部 202 个账号的 `last_request_at` 为空，但账号小时 usage 已有 166 个桶、约 9.5 亿 Token；根因是 usage 聚合只写累计桶，没有把每批最新请求时间同步到账号摘要。
- 最后请求修复放在独立 Controller usage worker：每批最多 500 个桶，使用 1 条有界 `VALUES ... UPDATE`，不逐账号写，不修改 `updated_at`，不进入 CPA 用户请求链路。
- 历史数据通过追加迁移从 `auth_usage_hour_buckets.MAX(bucket_at)` 一次性回填。线上同规模 EXPLAIN/ROLLBACK：141 行，约 12.95 ms，HashAggregate 32 kB；未实际提交数据。
- 决策列表旧实现虽有列名翻译入口，但 `current_capacity`、`target_capacity`、`deficit` 等键缺少中文，reason code 也直接显示英文；已补字段与 reason/event/entity/error code 映射。
- 页面所有原生 select 已替换为项目共享 `Select`，继承 Portal、键盘操作、主题和下拉层级；局部 trigger 保持自动补号页面绿色焦点风格。
- 订单 `amount` 来自 `charged_fen`，应按人民币分显示；容量和账号金额才是 micro USD，已分别格式化，避免单位混用。
