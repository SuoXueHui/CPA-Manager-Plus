# 自动补号经营统计线上修正设计

## 背景

Controller 已返回 `statistics`，但生产实际使用的是 CPA Manager Plus React 管理页；此前改动落在另一套独立页面，线上 `management.html` 因此没有显示用户要求的四项统计。

## 方案

- 在 `CPARefillOverview` 中显式声明经营统计 DTO，金额继续使用整数分和 micro USD。
- 在概览页最上方增加独立的“经营统计”区块，展示：今日采购花费、供应商可用余额、总消耗 Token、账号用量总金额。
- 主值显示用户最关心的累计/可用数；辅助文案展示总余额、冻结金额以及今日 Token/金额，避免继续增加卡片数量。
- DTO 缺失、负数或非有限数时显示 `—`，不能把坏数据伪装成 0；真实 0 正常显示为 `¥0.00`、`$0.00` 或 `0`。
- 保持当前中文优先、绿色运维面板风格和响应式网格，不修改 Controller、代理路由或采购状态机。

## 验证

- React 渲染测试覆盖四项中文标签、人民币/美元/Token 格式和缺失数据降级。
- API 类型与 wiring 测试确保 `statistics` 契约和四语言文案存在。
- 完成 type-check、lint、全量前端测试、生产 build、嵌入 bundle 同步以及 Manager Server Go 门禁。
