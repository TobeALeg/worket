export function sourceFixture(cwd = '/tmp') {
  return { id: 'synthetic-revisions', name: '修订来源验收', cwd, createdAt: 1700000000, updatedAt: 1700000001,
    turns: [{ id: 'turn-1', status: 'inProgress', startedAt: 1700000001, items: [
      { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: '每次报告必须包含来源链接。' }] },
      { id: 'reply-1', type: 'agentMessage', text: '已完成' },
      { id: 'command-1', type: 'commandExecution', command: 'report', status: 'inProgress', aggregatedOutput: '', exitCode: null },
    ] }],
  };
}
export function finishSource(payload) {
  const turn = payload.turns[0]; turn.status = 'completed'; turn.completedAt = 1700000010;
  turn.items[1].text = '已完成报告。下一步：请核对来源。';
  Object.assign(turn.items[2], { status: 'completed', aggregatedOutput: 'report.md ready', exitCode: 0 });
}
export function reviseSource(payload) {
  payload.turns[0].items[0].content[0].text = '每次报告必须包含来源链接和发布日期。';
  payload.turns[0].items[1].text = '已修复来源日期。下一步：确认日期后交付。';
}
