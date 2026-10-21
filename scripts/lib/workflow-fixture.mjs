import { randomUUID } from 'node:crypto';
const cid = () => randomUUID();
export function seedWorkflow(core) {
  const r = core.definitions;
  const make = (name, inputs, outputs) => {
    const item = (key, text) => ({ key, text, basis: { type: 'USER_AUTHORED', reviewEventId: cid() } });
    const content = { schemaVersion: 1, name, purpose: item('purpose', name), inputs: inputs.map(p => ({ ...item(p.key, p.text ?? p.key), required: true, ...p })), deliverables: outputs.map(p => ({ ...item(p.key, p.text ?? p.key), ...p })), acceptanceCriteria: [item('complete', '内容完整'), item('correct', '符合本次要求')], constraints: [], methods: [], materialRoles: [] };
    const draft = r.saveDraft({ id: cid(), revision: 1, content, originalContent: content, refs: [], issues: [], resolutions: [] });
    return r.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: cid() });
  };
  const research = make('主题调研', [{ key: 'brand', valueType: 'FILE' }], [{ key: 'report', valueType: 'FILE' }]);
  const script = make('脚本撰写', [{ key: 'report', valueType: 'FILE' }], [{ key: 'script', valueType: 'FILE' }, { key: 'copy', valueType: 'TEXT' }]);
  const video = make('视频制作', [{ key: 'script', valueType: 'FILE' }], [{ key: 'video', valueType: 'FILE' }]);
  const cover = make('封面制作', [{ key: 'copy', valueType: 'TEXT' }], [{ key: 'image', valueType: 'FILE' }]);
  const pack = make('整理交付包', [{ key: 'video', valueType: 'FILE' }, { key: 'image', valueType: 'FILE' }], [{ key: 'package', valueType: 'FILE' }]);
  const out = (nodeId, key) => ({ type: 'OUTPUT', nodeId, key });
  const content = { name: '内容制作', inputs: [{ key: 'brand', text: '品牌资料', valueType: 'FILE', required: true }], nodes: [
    { id: 'research', name: '主题调研', contractId: research.id, bindings: { brand: { type: 'INPUT', key: 'brand' } }, after: [] },
    { id: 'script', name: '脚本撰写', contractId: script.id, bindings: { report: out('research', 'report') }, after: [] },
    { id: 'video', name: '视频制作', contractId: video.id, bindings: { script: out('script', 'script') }, after: [] },
    { id: 'cover', name: '封面制作', contractId: cover.id, bindings: { copy: out('script', 'copy') }, after: [] },
    { id: 'pack', name: '整理交付包', contractId: pack.id, bindings: { video: out('video', 'video'), image: out('cover', 'image') }, after: [] },
  ], outputs: [{ key: 'delivery', nodeId: 'pack', outputKey: 'package' }] };
  return { content, research, script, video, cover, pack, make };
}
