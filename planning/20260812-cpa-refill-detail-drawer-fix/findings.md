# Findings

- 截图中详情面板从页面右侧约 520px 宽出现，但底层筛选器和表格文字仍显示在面板之上，属于层叠上下文/遮罩缺失，而不是接口数据异常。
- 当前 `CPARefillPage.tsx` 直接渲染 `<aside className={styles.detailPanel}>`；SCSS 使用 `position: fixed`、`z-index: 70`，未通过 Portal 挂到 `document.body`。
- 项目已有通用 `apps/web/src/components/ui/Drawer.tsx`：提供 `createPortal`、全屏遮罩、统一 modal z-index、滚动锁定、ESC/遮罩关闭、焦点恢复和移动端底部抽屉。
- 详情 API 返回长 `auth_file`、`cpa_auth_id` 等完整值；这些字段必须保留显示，但需要 `overflow-wrap/word-break` 和更合理的标签/值网格。
- 实施后详情类型使用独立 `detailKind` 快照，避免用户在详情打开时切换标签导致标题从“账号明细”误变成“订单明细”。
- 生产单文件 bundle 已确认包含共享 Drawer 遮罩/动画、长文本换行和窄屏单列样式；登录态依赖真实 Manager，因此本地仅验证构建产物结构，未伪造管理员凭据。
