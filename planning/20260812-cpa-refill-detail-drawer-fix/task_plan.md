# CPA 自动补号账号明细抽屉修复计划

## 目标
修复自动补号“账号明细”在桌面端浮层错位、内容覆盖列表、长字段挤压布局的问题；复用项目现有 Drawer 容器，不修改 Controller/API。

## 范围与风险
- 仅修改 CPA Manager Plus 前端自动补号页面、样式、相关测试与内嵌管理页构建产物。
- 保留现有账号详情/事件加载逻辑和接口契约。
- 关键风险：Drawer 动画异步关闭时详情状态清理时机、移动端宽度、长 auth_file/CPA Auth ID 换行。

## 阶段
1. [complete] 核对截图、当前 master、现有详情实现和通用 Drawer 组件
2. [complete] 先补失败测试，固定遮罩、Portal、语义和详情布局要求
3. [complete] 最小修改为通用 Drawer，并整理详情内容样式
4. [complete] 运行定向测试、类型检查、lint、构建与产物同步验证
5. [in_progress] 自检改动并更新 planning/知识文档

## 决策
- 根因定位：当前详情使用页面内 `position: fixed; z-index: 70` 的自制 aside；它没有全屏遮罩/Portal，层级低于管理页面部分内容，导致底层筛选和表格穿透覆盖；详情行固定 `155px + 1fr` 又会让长文件名视觉拥挤。
- 方案：复用 `@/components/ui/Drawer`，由其统一提供 Portal、遮罩、z-index、滚动锁定、ESC/点击遮罩关闭和移动端行为；业务页只保留详情内容布局。

## 错误记录
| 错误 | 次数 | 处理 |
|---|---:|---|
| `functions.exec` 脚本中局部变量名 `path` 覆盖 zsh 特殊数组 `path`，导致 `git: command not found` | 1 | 改用变量名 `wt` 并显式调用 `/usr/bin/git` |
