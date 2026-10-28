const { contextBridge, ipcRenderer } = require("electron");
let flushWorkflowDraft = async () => {};
ipcRenderer.on('workflow:flushDraft', async (_event, id) => {
  try { await flushWorkflowDraft(); ipcRenderer.send('workflow:draftFlushed', { id }); }
  catch (error) { ipcRenderer.send('workflow:draftFlushed', { id, error: String(error) }); }
});

contextBridge.exposeInMainWorld("workpet", {
  previewSelectedContent: input => ipcRenderer.invoke("connectors:preview", input),
  importSelectedContent: input => ipcRenderer.invoke("connectors:import", input),
  listSelectedInbox: () => ipcRenderer.invoke("connectors:inbox"),
  readSelectedInbox: id => ipcRenderer.invoke("connectors:inbox-read", id),
  removeSelectedInbox: id => ipcRenderer.invoke("connectors:inbox-remove", id),
  chooseSelectedImport: () => ipcRenderer.invoke("connectors:choose-import"),
  exportInlinePackage: workId => ipcRenderer.invoke("connectors:export-inline", workId),
  copyInlinePackage: workId => ipcRenderer.invoke("connectors:copy-inline", workId),
  feedback: (action, input) => ipcRenderer.invoke("feedback:command", action, input),
  onFeedbackCollapse: (callback) => {const listener = () => callback(); ipcRenderer.on("feedback:collapse", listener); return () => ipcRenderer.removeListener("feedback:collapse", listener);},
  openArtifact: (workId, itemId) => ipcRenderer.invoke("work:open-artifact", workId, itemId),
  distillation: (action, input) => ipcRenderer.invoke("distillation:command", action, input),
  workflow: (action, input) => ipcRenderer.invoke('workflow:command', action, input),
  setWorkflowExpanded: expanded => ipcRenderer.invoke('workflow:expanded', expanded),
  onWorkflowDraftFlush: callback => { flushWorkflowDraft = callback; return () => { if (flushWorkflowDraft === callback) flushWorkflowDraft = async () => {}; }; },
  chooseDefinitionFile: (kind) => ipcRenderer.invoke("distillation:choose-file", kind),
  exportWorkPackage: (workId) => ipcRenderer.invoke("distillation:export", workId),
  copyWorkPackage: (workId) => ipcRenderer.invoke("distillation:copy", workId),
  configureWorketService: (input) => ipcRenderer.invoke("distillation:configure", input),
  getWorketServiceStatus: () => ipcRenderer.invoke("distillation:connection"),
  copyWorketRecoveryCode: () => ipcRenderer.invoke("distillation:copy-recovery"),
  restoreWorketAccount: (recoveryCode) => ipcRenderer.invoke("distillation:restore-account", recoveryCode),
  openCurrentContextFromPet: () => ipcRenderer.invoke("panel:open-current-context"),
  onPetPlacement: (callback) => {
    const listener = (_event, edge) => callback(edge);
    ipcRenderer.on("pet:placement", listener);
    return () => ipcRenderer.removeListener("pet:placement", listener);
  },
  openDistillationFromPet: () => ipcRenderer.invoke("pet:open-distillation"),
  onOpenDistillation: (callback) => {
    const listener = (_event, jobId) => callback(jobId);
    ipcRenderer.on("distillation:open", listener);
    return () => ipcRenderer.removeListener("distillation:open", listener);
  },
  getPetView: () => ipcRenderer.invoke("pet:get-view"),
  togglePanelFromPet: () => ipcRenderer.invoke("panel:toggle"),
  setPetMousePassthrough: (ignored) => ipcRenderer.send("pet:mouse-passthrough", ignored),
  dragPet: (phase, cursor) => ipcRenderer.send("pet:drag", phase, cursor),
  getDashboard: (workId) => ipcRenderer.invoke("dashboard:get", workId),
  listExecutors: () => ipcRenderer.invoke("executors:list"),
  listConversations: (executorId) => ipcRenderer.invoke("conversations:list", executorId),
  listRecentConversations: () => ipcRenderer.invoke("conversations:recent"),
  listConversationHistory: (executorId, cursor, searchTerm) => ipcRenderer.invoke("conversations:history", executorId, cursor, searchTerm),
  previewConversation: (executorId, threadId) => ipcRenderer.invoke("conversations:preview", executorId, threadId),
  createWorkFromConversation: (request) => ipcRenderer.invoke("work:create-from-conversation", request),
  listSplitPoints: (workId) => ipcRenderer.invoke("work:split-points", workId),
  createWorkFromMessage: (request) => ipcRenderer.invoke("work:create-from-message", request),
  consumeSourceSelection: () => ipcRenderer.invoke("conversations:selection"),
  refreshWork: (workId) => ipcRenderer.invoke("work:refresh", workId),
  archiveWork: (workId) => ipcRenderer.invoke("work:archive", workId),
  reopenHandoff: (workId) => ipcRenderer.invoke("work:reopen-handoff", workId),
  cancelHandoff: (workId, confirmation) => ipcRenderer.invoke("work:cancel-handoff", workId, confirmation),
  handoff: (workId, executorId) => ipcRenderer.invoke("work:handoff", workId, executorId),
  deleteLocalActivity: (workId, confirmation) => ipcRenderer.invoke("work:delete-local-activity", workId, confirmation),
  onPanelShown: (callback) => {
    const listener = (_event, workId) => callback(workId);
    ipcRenderer.on("panel:shown", listener);
    return () => ipcRenderer.removeListener("panel:shown", listener);
  },
  resizePanelRight: (phase, screenX) => ipcRenderer.send("panel:resize-right", phase, screenX),
  closePanel: () => ipcRenderer.invoke("panel:close")
});
