import { array, ensure, object, string } from '../contracts/definition.js';
import type { DefinitionRepository } from '../definitions/repository.js';
import type { Binding, Port, WorkflowContent } from './types.js';
import { dependencies, outputPorts } from './types.js';

export const validKey = (key: unknown): void => { ensure(typeof key === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(key), 'INVALID_INPUT', '名称标识须以字母开头，仅含字母、数字、短横线或下划线'); };
export function validateValue(port: Pick<Port, 'key' | 'valueType' | 'choices'>, value: unknown): void {
  ensure(port.valueType === 'NUMBER' ? typeof value === 'number' && Number.isFinite(value)
    : port.valueType === 'BOOLEAN' ? typeof value === 'boolean'
    : typeof value === 'string' && value.trim().length > 0 && value.length <= 2 * 1024 * 1024,
  'INPUT_TYPE_MISMATCH', `请检查「${port.key}」的值与类型`);
  if (port.valueType === 'CHOICE') ensure(port.choices?.includes(String(value)), 'INPUT_TYPE_MISMATCH', '请选择约定内的选项');
}
export function validatePort(port: Port): void {
  object(port); validKey(port.key); string(port.text);
  ensure(['TEXT', 'NUMBER', 'BOOLEAN', 'CHOICE', 'FILE'].includes(port.valueType), 'OUTPUT_TYPE_REQUIRED', '请先确认 Contract 的输出类型');
  ensure(typeof port.required === 'boolean', 'INVALID_INPUT');
  if (port.valueType === 'CHOICE') { array(port.choices); ensure(port.choices.length > 0, 'INVALID_INPUT'); port.choices.forEach(string); }
  if (port.defaultValue !== undefined) { ensure(port.valueType !== 'FILE', 'INVALID_INPUT'); validateValue(port, port.defaultValue); }
}
export function validateWorkflow(content: WorkflowContent, repository: DefinitionRepository): void {
  object(content); string(content.name); array(content.inputs); array(content.nodes); array(content.outputs);
  ensure(content.name.length <= 160 && content.nodes.length > 0 && content.nodes.length <= 50 && content.inputs.length <= 100, 'INVALID_INPUT');
  content.inputs.forEach(validatePort);
  ensure(new Set(content.inputs.map(p => p.key)).size === content.inputs.length, 'INVALID_INPUT', '流程输入标识重复');
  const ids = new Set(content.nodes.map(n => n.id));
  ensure(ids.size === content.nodes.length, 'INVALID_INPUT', '节点标识重复');
  const contracts = new Map(content.nodes.map(n => [n.id, repository.get(n.contractId)]));
  for (const node of content.nodes) {
    object(node); validKey(node.id); string(node.name); object(node.bindings); array(node.after);
    ensure(node.name.length <= 160 && node.after.every(id => ids.has(id)), 'INVALID_INPUT', '前置工作不存在');
    const contract = contracts.get(node.id)!;
    const outputs = outputPorts(contract); ensure(outputs.length > 0, 'OUTPUT_TYPE_REQUIRED'); outputs.forEach(validatePort);
    ensure(Object.keys(node.bindings).every(key => contract.content.inputs.some(p => p.key === key)), 'INVALID_INPUT', '连接指向不存在的输入');
    for (const port of contract.content.inputs) {
      const binding: Binding | undefined = node.bindings[port.key];
      if (!binding) { ensure(!port.required || port.defaultValue !== undefined, 'INPUT_REQUIRED', `${node.name} / ${port.text} 尚未连接`); continue; }
      object(binding);
      if (binding.type === 'VALUE') { ensure(port.valueType !== 'FILE', 'INVALID_INPUT', '文件请通过本次流程输入提供'); validateValue(port, binding.value); continue; }
      let source: Port | undefined;
      if (binding.type === 'INPUT') source = content.inputs.find(p => p.key === binding.key);
      else if (binding.type === 'OUTPUT') source = contracts.has(binding.nodeId) ? outputPorts(contracts.get(binding.nodeId)!).find(p => p.key === binding.key) : undefined;
      ensure(source, 'INPUT_REQUIRED', '输入来源不存在');
      ensure(source.valueType === port.valueType, 'INPUT_TYPE_MISMATCH', `${node.name} / ${port.text} 需要 ${port.valueType}，来源为 ${source.valueType}`);
      if (port.required) ensure(source.required || source.defaultValue !== undefined, 'INPUT_REQUIRED', '必填输入不能依赖可缺省的来源');
      if (port.valueType === 'CHOICE') ensure(source.choices?.every(c => port.choices?.includes(c)), 'INPUT_TYPE_MISMATCH', '来源选项超出目标约定');
    }
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): void => { ensure(!visiting.has(id), 'WORKFLOW_CYCLE', '连接形成循环，请调整输入来源或前置工作'); if (visited.has(id)) return; visiting.add(id); dependencies(content.nodes.find(n => n.id === id)!).forEach(visit); visiting.delete(id); visited.add(id); };
  content.nodes.forEach(n => visit(n.id));
  ensure(content.outputs.length > 0 && new Set(content.outputs.map(o => o.key)).size === content.outputs.length, 'INPUT_REQUIRED', '请选择流程的最终交付');
  for (const out of content.outputs) { validKey(out.key); ensure(contracts.has(out.nodeId) && outputPorts(contracts.get(out.nodeId)!).some(p => p.key === out.outputKey), 'INVALID_INPUT', '最终交付来源不存在'); }
}
