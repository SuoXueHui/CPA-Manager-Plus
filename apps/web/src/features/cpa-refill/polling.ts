export const CPA_REFILL_OVERVIEW_POLL_MS = 15_000;

// 页面隐藏时暂停轮询，避免后台标签持续占用 Manager 和 Controller 连接。
export const shouldPollCPARefillOverview = (visibilityState: DocumentVisibilityState) =>
  visibilityState === 'visible';
