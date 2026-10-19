import type { DefinitionContent } from '../contracts/definition.js';

// A short, editable library label. It describes the work domain, not a contract version.
const categories: [string, RegExp][] = [
  ['网站运维', /网站|网页|站点|域名|SEO|GA4|Search Console|WordPress|线上服务监控/iu],
  ['软件开发', /开发|编程|代码|程序|软件|应用|接口|API|bug|测试/iu],
  ['数据分析', /数据分析|报表|指标|统计|仪表盘|可视化|分析配置/iu],
  ['内容运营', /内容运营|社交媒体|公众号|文案|营销|推广|发布计划/iu],
  ['视觉制作', /设计|图像|图片|视频|动画|剪辑|海报/iu],
  ['研究调研', /研究|调研|竞品|文献|市场分析/iu],
  ['文档写作', /文档|报告|方案|写作|翻译|总结/iu],
  ['财务管理', /财务|报销|账单|发票|预算|成本核算/iu],
];

export function inferredCategory(content: Pick<DefinitionContent, 'name' | 'purpose'>): string {
  const description = `${content.name} ${content.purpose.text}`;
  return categories.find(([, pattern]) => pattern.test(description))?.[0] ?? '其他工作';
}

export function validateCategory(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > 12 || /[\r\n\t<>]/u.test(value)) {
    throw new Error('INVALID_CATEGORY：分类需为 1–12 个字符');
  }
}
