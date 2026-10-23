/** The header owns disclosure; the source picker continues to own search results. */
export function setupHeaderSearch(openSources: () => void): { close: () => void } {
  const root = document.querySelector<HTMLElement>('#header-search')!;
  const button = root.querySelector<HTMLButtonElement>('#toggle-source-search')!;
  const field = root.querySelector<HTMLElement>('#header-search-field')!;
  const input = root.querySelector<HTMLInputElement>('#source-search')!;
  const header = root.closest<HTMLElement>('.brand-row')!;

  function close(): void {
    if (field.hidden) return;
    field.hidden = true;
    root.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '搜索聊天');
    button.title = '搜索聊天';
    if (input.value) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  button.addEventListener('click', () => {
    if (!field.hidden) { close(); button.focus(); return; }
    openSources();
    field.hidden = false;
    root.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', '收起搜索');
    button.title = '收起搜索';
    input.focus();
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
    button.focus();
  });
  header.addEventListener('header-page-change', close);
  return { close };
}
