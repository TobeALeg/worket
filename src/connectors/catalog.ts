/** Product identities are separate from code agents and model APIs. */
export const WEB_CONNECTORS = [
  { id: "qwenwork-web", name: "QwenWork 网页", mark: "Q", url: "https://qwenwork.ai/", hosts: ["qwenwork.ai", "www.qwenwork.ai"] },
  { id: "kimi-work", name: "Kimi Work 网页", mark: "K", url: "https://www.kimi.com/", hosts: ["www.kimi.com", "kimi.com"] },
  { id: "doubao-work", name: "豆包工作网页", mark: "豆", url: "https://www.doubao.com/work", hosts: ["www.doubao.com", "doubao.com"] },
  { id: "coze-web", name: "扣子网页", mark: "扣", url: "https://www.coze.cn/", hosts: ["www.coze.cn", "coze.cn"] },
  { id: "web-selected", name: "其他网页（手动复制）", mark: "↗", url: null, hosts: [] },
] as const;
export function validateSourceUrl(adapterId: string, value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("来源必须为无凭据的 HTTPS 网页地址。");
  const connector = WEB_CONNECTORS.find(item => item.id === adapterId);
  if (!connector || (connector.hosts.length && !(connector.hosts as readonly string[]).includes(url.hostname))) throw new Error("来源站点与连接器不符。");
  // Query strings may contain credentials. A locator never needs them.
  url.search = ""; url.hash = "";
  return url.toString();
}
