import type { WorkPackage } from '../definitions/work-package.js';
import type { ContinuationMaterials } from './continuation.js';

/** Include every pinned dependency in cache invalidation, including skills and references. */
export function packageMaterialVersions(pkg: WorkPackage): ContinuationMaterials {
  return [
    ...(pkg.definition ? [{ id: `definition:${pkg.definition.id}`, version: pkg.definition.contentHash, availability: 'AVAILABLE' }] : []),
    ...[...pkg.fixedMaterials, ...(pkg.inputMaterials ?? [])].map(m => ({ id: m.path, version: m.hash, availability: 'AVAILABLE' })),
    ...pkg.skills.map(skill => ({ id: skill.directory, version: skill.hash, availability: 'AVAILABLE' })),
    ...pkg.referenceExamples.flatMap(value => {
      const reference = value as { material?: { path: string; hash: string } };
      return reference.material ? [{ id: reference.material.path, version: reference.material.hash, availability: 'AVAILABLE' }] : [];
    }),
  ];
}
