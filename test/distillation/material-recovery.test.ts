import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmSync, symlinkSync, existsSync, chmodSync, lstatSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { MaterialStore } from '../../dist/definitions/storage.js';
import { replaceMaterialDirectory } from '../../dist/definitions/material-files.js';
import { writeSkillFixture } from '../../scripts/lib/skill-fixture.mjs';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-material-repair-'));
  const store = new MaterialStore(join(directory, 'store'));
  return { directory, store, close: () => rmSync(directory, { recursive: true, force: true }) };
}
test('explicit exact-version recovery restores corrupt, missing and unreadable files; wrong versions and foreign paths never overwrite', () => {
  const f = fixture(); try {
    const source = join(f.directory, 'FRAME.md'); writeFileSync(source, '固定条款');
    const material = f.store.copy(source, 'frame');
    writeFileSync(material.path, '损坏条款'); writeFileSync(source, '变更条款');
    assert.throws(() => f.store.restore(material, source), /MATERIAL_VERSION_MISMATCH/);
    assert.equal(readFileSync(material.path, 'utf8'), '损坏条款');
    writeFileSync(source, '固定条款'); f.store.restore(material, source); f.store.verify(material);
    const identity = structuredClone(material);
    unlinkSync(material.path); f.store.restore(material, source); assert.deepEqual(material, identity);
    chmodSync(material.path, 0); f.store.restore(material, source); f.store.verify(material);
    const outside = join(f.directory, 'outside'); writeFileSync(outside, '不能覆盖');
    assert.throws(() => f.store.restore({ ...material, path: outside }, source), /INVALID_MATERIAL_PATH/);
    assert.equal(readFileSync(outside, 'utf8'), '不能覆盖');
    unlinkSync(material.path); symlinkSync(outside, material.path);
    assert.throws(() => f.store.restore(material, source), /INVALID_MATERIAL_PATH/);
    assert.equal(readFileSync(outside, 'utf8'), '不能覆盖');
  } finally { f.close(); }
});
test('reselecting identical content repairs named instance copies without changing paths or their manifests', () => {
  const f = fixture(); try {
    const source = join(f.directory, 'SCRIPT.md'); writeFileSync(source, '本次输入');
    const material = f.store.copy(source, 'script', true);
    writeFileSync(material.path, '损坏');
    assert.deepEqual(f.store.copy(source, 'script', true), material);
    assert.equal(readFileSync(material.path, 'utf8'), '本次输入');
    const outside = join(f.directory, 'external'); mkdirSync(outside); writeFileSync(join(outside, 'SCRIPT.md'), '外部文件');
    rmSync(dirname(material.path), { recursive: true }); symlinkSync(outside, dirname(material.path));
    assert.throws(() => f.store.restore(material, source), /INVALID_MATERIAL_PATH/);
    assert.equal(readFileSync(join(outside, 'SCRIPT.md'), 'utf8'), '外部文件');
  } finally { f.close(); }
});
test('skill recovery validates the whole original version, repairs extras and permissions, and preserves shared hash identity', () => {
  const f = fixture(); try {
    const source = join(f.directory, 'skill'); writeSkillFixture(source);
    const material = f.store.copySkill(source, 'builder'), root = dirname(material.path);
    const script = join(root, 'scripts/report.mjs'); chmodSync(script, 0o600);
    writeFileSync(join(root, 'unexpected'), '多余文件'); unlinkSync(join(root, 'references/format.md'));
    writeSkillFixture(source, '不同版本'); assert.throws(() => f.store.restore(material, source), /MATERIAL_VERSION_MISMATCH/);
    assert.equal(existsSync(join(root, 'unexpected')), true);
    writeSkillFixture(source); f.store.restore(material, source); f.store.verify(material);
    assert.equal(existsSync(join(root, 'unexpected')), false); assert.ok(lstatSync(script).mode & 0o111);
    assert.ok(existsSync(join(root, 'assets/empty')));
    assert.deepEqual(f.store.copySkill(source, 'builder'), material);
    rmSync(root, { recursive: true }); f.store.restore(material, source); f.store.verify(material);
    symlinkSync('/tmp', join(source, 'external'));
    assert.throws(() => f.store.restore(material, source), /UNSUPPORTED_FILE/); f.store.verify(material);
  } finally { f.close(); }
});
test('failed directory replacement restores the previous managed copy and leaves no repair backup', () => {
  const f = fixture(); try {
    const target = join(f.directory, 'existing'); mkdirSync(target); writeFileSync(join(target, 'original'), '保留');
    assert.throws(() => replaceMaterialDirectory(join(f.directory, 'missing-stage'), target), /ENOENT/);
    assert.equal(readFileSync(join(target, 'original'), 'utf8'), '保留');
    assert.deepEqual(readdirSync(f.directory), ['existing']);
  } finally { f.close(); }
});
