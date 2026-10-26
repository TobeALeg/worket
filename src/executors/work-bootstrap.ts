import type { WorkSnapshot } from '../core/types.js';
import { packageMarkdown, type WorkPackage } from '../definitions/work-package.js';
import { deliveryFooter } from './delivery-markers.js';

// WorkBuddy's deep link accepts at most 8,000 UTF-16 code units, including metadata.
export const INLINE_WORK_LIMIT = 8_000;

export interface WorkBootstrapInput {
  workId: string;
  deliveryId?: string;
  purpose?: 'START' | 'CONTINUE';
  title: string;
  contextVersion?: 2 | 3 | 4;
}

/** Only oversized work instructions require a separate read; never truncate execution inputs. */
export function buildWorkBootstrap(input: WorkBootstrapInput): string {
  const title = input.title.length > 120 ? `${input.title.slice(0, 120)}…` : input.title;
  return [
    input.purpose === 'START' ? `请开展一项新工作：${title}` : `请继续这项工作：${title}`,
    '',
    '完整工作说明较长，请先通过 Worket MCP 的 get_work_context 读取全文，再开始执行。',
    `参数：work_id=${input.workId}、context_version=${input.contextVersion ?? 4}${input.deliveryId ? `、delivery_id=${input.deliveryId}` : ''}。`,
    '本次输入、交付要求和有效约束以完整说明为准；缺少影响执行的信息时再询问。',
    '', deliveryFooter(input.workId, input.deliveryId),
  ].join('\n');
}

export function buildWorkDelivery(work: WorkSnapshot, pkg: WorkPackage, deliveryId: string): string {
  const full = [pkg.purpose === 'START' ? '请按以下说明开展新工作。' : '请按以下说明继续同一项工作。',
    '', packageMarkdown(pkg, work), '', deliveryFooter(work.instance.id, deliveryId, true)].join('\n');
  return full.length <= INLINE_WORK_LIMIT ? full : buildWorkBootstrap({
    workId: work.instance.id, deliveryId, purpose: pkg.purpose,
    title: pkg.definition?.content.name ?? pkg.state.objective[0]?.text ?? work.definition.name,
  });
}
