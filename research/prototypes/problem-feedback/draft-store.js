// Deliberate local persistence for the draft-continuation prototype. No server uploads.
const DATABASE = 'worket-feedback-prototype';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let connection;
let operations = Promise.resolve();
function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
function change(action) {
  operations = operations.catch(() => {}).then(async () => {
    const db = await database();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      action(transaction.objectStore('drafts'));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  });
  return operations;
}
export async function readDraft() {
  const db = await database();
  const draft = await new Promise((resolve, reject) => {
    const request = db.transaction('drafts').objectStore('drafts').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (draft && Date.now() - draft.updatedAt >= RETENTION_MS) { await removeDraft(); return null; }
  return draft;
}
export const writeDraft = draft => change(store => store.put({ ...draft, updatedAt: Date.now() }, 'current'));
export const removeDraft = () => change(store => store.delete('current'));
