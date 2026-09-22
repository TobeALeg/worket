import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { ensure } from '../contracts/definition.js';
import { MaterialStore, type Material } from './storage.js';
import type { Definition, Inputs } from './repository.js';
import type { InstanceOverride } from '../contracts/rules.js';
export type InstanceReference = { id: string; path: string; hash: string; filename: string; role: string; material?: Material };
export type InstanceInputs = { inputs: Inputs; referenceExamples: InstanceReference[]; ruleOverrides?: InstanceOverride[]; inputMaterials?: Material[] };
/** Instance files have independent ownership; deleting a definition cannot remove them. */
export class InstanceFiles {
  constructor(readonly directory: string) {}
  store(workId: string): MaterialStore {
    ensure(/^[A-Za-z0-9_-]+$/.test(workId), 'INVALID_INPUT');
    return new MaterialStore(join(this.directory, 'instances', workId));
  }
  copy(workId: string, path: string, role: string): Material {
    const store = this.store(workId), material = store.copy(path, role, true);
    store.verify(material); return material;
  }
  reference(workId: string, reference: InstanceReference): InstanceReference {
    if (reference.material) { this.store(workId).verify(reference.material); return reference; }
    const material = this.copy(workId, reference.path, `reference:${reference.id}`);
    ensure(material.hash === reference.hash, 'MATERIAL_MISSING', '参考文件已变化，请移除该参考或重新选择');
    return { ...reference, path: material.path, material };
  }
  verify(workId: string, definition: Definition, binding: InstanceInputs): void {
    const store = this.store(workId);
    for (const input of definition.content.inputs.filter(input => input.valueType === 'FILE')) {
      if (!binding.inputs[input.key]) continue;
      const material = binding.inputMaterials?.find(material => material.role === input.key);
      ensure(material && material.path === binding.inputs[input.key], 'INPUT_FILE_UNVERIFIED', '历史输入文件尚未固定，请在“本次文件”中重新选择');
      store.verify(material);
    }
    for (const reference of binding.referenceExamples) {
      ensure(reference.material && reference.path === reference.material.path && reference.hash === reference.material.hash, 'REFERENCE_FILE_UNVERIFIED', '历史参考文件尚未固定，请在“本次文件”中确认或移除');
      store.verify(reference.material);
    }
  }
  remove(workId: string): void { rmSync(this.store(workId).directory, { recursive: true, force: true }); }
}
