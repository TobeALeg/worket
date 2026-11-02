// Self-contained: Chrome serializes this function into the active tab's isolated world.
export async function captureCurrentChat() {
  try {
    const url = location.origin + location.pathname;
    if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname) ||
        location.protocol !== 'https:' || !/\/c\/[a-zA-Z0-9-]+\/?$/.test(location.pathname))
      throw new Error('请先打开一个已有消息的 ChatGPT 聊天。');
    const root = document.querySelector('[data-chatgpt-conversation-selection-target]') ?? document.querySelector('main');
    if (!root) throw new Error('未识别到 ChatGPT 聊天正文，请刷新网页后重试。');
    const firstMessage = root.querySelector('[data-chatgpt-search-unit-key], [data-message-author-role]');
    let scroller = firstMessage?.parentElement;
    while (scroller && !(scroller.clientHeight > 0 && scroller.scrollHeight > scroller.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    scroller ??= document.scrollingElement;
    if (!scroller) throw new Error('无法定位聊天历史滚动区域。');
    const originalTop = scroller.scrollTop;
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    for (const event of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(event, cancel, true);
    const started = Date.now();
    const pause = () => new Promise(resolve => setTimeout(resolve, 350));
    const check = () => {
      if (cancelled) throw new Error('读取已取消：请保持聊天不变，并重新点击“导入当前聊天”。');
      if (location.origin + location.pathname !== url || !root.isConnected)
        throw new Error('聊天已切换，未导入，请在目标聊天重新读取。');
      if (Date.now() - started > 90_000) throw new Error('历史加载超时，未导入不完整聊天，请稍后重试。');
      if (document.querySelector('[data-testid="stop-button"], [data-is-streaming="true"]') ||
          root.querySelector('[data-talvt-turn-state]:not([data-talvt-turn-state="complete"])'))
        throw new Error('聊天仍在生成或处理中，请等待结束后再导入。');
    };
    // Text projection of message bodies only. Keep paragraphs, tables, code and links;
    // exclude hidden content and action controls without reading application internals.
    const text = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (!(node instanceof Element)) return '';
      if (node.matches('button, svg, script, style, [hidden], [aria-hidden="true"], [data-markdown-copy="exclude"], [role="button"]')) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'PRE') return `\n${[...node.childNodes].map(text).join('')}\n`;
      const value = [...node.childNodes].map(text).join('');
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        return href && /^(https?:|file:|\/)/.test(href) && !value.includes(href) ? `${value} (${href})` : value;
      }
      if (['TD', 'TH'].includes(node.tagName)) return `${value}\t`;
      return /^(DIV|P|H[1-6]|LI|UL|OL|BLOCKQUOTE|TABLE|TR)$/.test(node.tagName) ? `${value}\n` : value;
    };
    const scan = () => {
      check();
      const modern = [...root.querySelectorAll('[data-chatgpt-search-unit-key]')];
      const elements = modern.length ? modern : [...root.querySelectorAll('[data-message-author-role]')];
      const messages = [];
      for (const element of elements) {
        const key = element.getAttribute('data-chatgpt-search-unit-key');
        const role = modern.length ? key?.match(/:(user|assistant)$/)?.[1] : element.getAttribute('data-message-author-role');
        if (role !== 'user' && role !== 'assistant') continue;
        const bodies = modern.length
          ? [...element.querySelectorAll(role === 'user' ? '[data-user-message-bubble]' : '[data-markdown-text-style="assistant-message"]')]
          : [...element.querySelectorAll(role === 'user' ? '.whitespace-pre-wrap' : '.markdown')];
        const content = (bodies.length ? bodies.map(text).join('\n') : modern.length ? '' : text(element)).replace(/\n{3,}/g, '\n\n').trim();
        const ids = [...new Set((element.getAttribute('data-chatgpt-search-message-ids') ?? element.getAttribute('data-message-id') ?? '').split(/\s+/).filter(Boolean))];
        if (!content) {
          if (role === 'user' || element.querySelector('img, video, audio, canvas'))
            throw new Error('聊天含无法读取正文的消息或附件消息，未作为完整聊天导入。');
          continue; // Tool-only/status blocks are not visible assistant message bodies.
        }
        if (!ids.length) throw new Error('聊天消息缺少稳定标识，未导入可能重复或错序的历史。');
        const id = `${role}:${ids.join(':')}`;
        messages.push({ id, role, content });
      }
      if (!messages.length) throw new Error('没有读到聊天消息；页面可能仍在加载或结构已变化。');
      if (new Set(messages.map(message => message.id)).size !== messages.length)
        throw new Error('页面含重复消息视图，请关闭其他预览后重试。');
      return messages;
    };
    try {
      // Wait for older messages loaded at the start to settle before collecting.
      let stable = 0, last = '';
      for (let attempt = 0; attempt < 20 && stable < 3; attempt++) {
        scroller.scrollTo({ top: 0, behavior: 'instant' }); await pause();
        const messages = scan();
        const signature = JSON.stringify([messages, scroller.scrollHeight]);
        stable = scroller.scrollTop <= 2 && signature === last && !root.querySelector('[role="progressbar"], [aria-busy="true"]') ? stable + 1 : 0;
        last = signature;
      }
      if (stable < 3) throw new Error('未能确认聊天起点已加载，未导入不完整历史。');
      const observed = new Map(), edges = new Map();
      const collect = messages => {
        for (let index = 0; index < messages.length; index++) {
          const message = messages[index], before = observed.get(message.id);
          if (before && before.content !== message.content) throw new Error('读取期间消息发生变化，未保存混合版本，请重新读取。');
          observed.set(message.id, message);
          if (!edges.has(message.id)) edges.set(message.id, new Set());
          if (index) edges.get(messages[index - 1].id).add(message.id);
        }
        if (observed.size > 2000 || new TextEncoder().encode(JSON.stringify([...observed.values()])).length > 800_000)
          throw new Error('当前聊天超过 2000 条消息或传输大小上限，未截断导入。');
      };
      let bottomStable = 0, previousBottom = '';
      for (let step = 0; step < 220 && bottomStable < 3; step++) {
        const messages = scan(); collect(messages);
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        const signature = JSON.stringify([messages, scroller.scrollHeight]);
        bottomStable = atBottom && signature === previousBottom && !root.querySelector('[role="progressbar"], [aria-busy="true"]') ? bottomStable + 1 : 0;
        previousBottom = signature;
        if (!atBottom) scroller.scrollTo({ top: scroller.scrollTop + Math.max(100, scroller.clientHeight * 0.8), behavior: 'instant' });
        await pause();
      }
      if (bottomStable < 3) throw new Error('未能读取到聊天末尾，未导入不完整历史。');
      check();
      // Snapshots can overlap or omit off-screen virtualized messages. Order by
      // observed relative order rather than by the time a message was first seen.
      const indegree = new Map([...observed.keys()].map(id => [id, 0]));
      for (const targets of edges.values()) for (const id of targets) indegree.set(id, indegree.get(id) + 1);
      const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id), messages = [];
      while (queue.length) {
        if (queue.length !== 1) throw new Error('历史消息之间存在未加载的间隔，无法确认顺序，请重试。');
        const id = queue.shift(); messages.push(observed.get(id));
        for (const next of edges.get(id)) { indegree.set(next, indegree.get(next) - 1); if (!indegree.get(next)) queue.push(next); }
      }
      if (messages.length !== observed.size) throw new Error('聊天分支或消息顺序已变化，请重新读取。');
      return { url, conversationId: url, title: document.title.slice(0, 512), messages, captureMode: 'CURRENT_CHAT' };
    } finally {
      for (const event of ['pointerdown', 'keydown', 'wheel']) document.removeEventListener(event, cancel, true);
      if (!cancelled && scroller.isConnected && location.origin + location.pathname === url)
        scroller.scrollTo({ top: originalTop, behavior: 'instant' });
    }
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
