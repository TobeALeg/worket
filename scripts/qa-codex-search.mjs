// Component-only browser test. Synthetic RPC results; no installed app or real conversation is accessed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
        const page = await browser.newPage();
        await page.route('http://worket-fixture.test/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/')
                return route.fulfill({ contentType: 'text/html', body: `<div id="source-providers"></div><span id="source-search-label"></span><input id="source-search"><p id="source-error"></p><div id="recent-sources"></div><button id="source-more">More</button><button id="source-retry">Retry</button><script type="module">import{setupRecordingSources}from'/renderer/recording-sources.js';const sources=setupRecordingSources(()=>{});sources.refresh();</script>` });
            const path = resolve('dist', pathname.startsWith('/executor-logos/') ? './renderer' + pathname : '.' + pathname);
            if (!path.startsWith(resolve('dist') + '/'))
                return route.abort();
            await route.fulfill(path.endsWith('.png') ? { contentType: 'image/png', body: await readFile(path) } : { contentType: 'text/javascript', body: await readFile(path, 'utf8') });
        });
        await page.addInitScript(() => {
            const g = window;
            g.calls = [];
            g.records = [];
            g.pending = {};
            const row = (id, title) => ({ id, title, executorId: 'codex', agentName: 'Codex', cwd: '/tmp/synthetic', updatedAt: new Date().toISOString() });
            g.workpet = { listExecutors: async () => [{ id: 'codex', name: 'Codex' }, { id: 'workbuddy', name: 'WorkBuddy' }], distillation: async () => ({ required: false }), listRecentConversations: async () => ({ threads: [], errors: [] }),
                listConversationHistory: async (executor, cursor, query) => {
                    g.calls.push({ executor, cursor, query });
                    if (executor === 'workbuddy') return { threads: [{ ...row('buddy', 'Buddy history'), executorId: 'workbuddy', agentName: 'WorkBuddy', updatedAt: '2026-01-01T00:00:00Z' }], nextCursor: null };
                    if (query === 'FIRST' || query === 'OLD_ERROR')
                        return new Promise((resolve, reject) => { g.pending[query] = { resolve, reject }; });
                    if (query === 'SECOND')
                        return { threads: cursor ? [row('second', 'SECOND result'), row('extra', 'SECOND extra')] : [row('second', 'SECOND result')], nextCursor: cursor ? null : 'more-SECOND' };
                    return { threads: [row('base', 'BASE')], nextCursor: 'more-BASE' };
                }, createWorkFromConversation: async (input) => { g.records.push(input); return {}; }, getDashboard: async () => ({}) };
        });
        await page.goto('http://worket-fixture.test/');
        await page.locator('[data-provider="workbuddy"]').waitFor();
        assert.deepEqual(await page.locator('.source-group-title').allTextContents(), ['Codex', 'WorkBuddy']);
        assert.equal(await page.locator('[data-provider="codex"] img').getAttribute('src'), './executor-logos/codex.png');
        await page.locator('[data-provider="workbuddy"]').click();
        assert.equal(await page.locator('[data-thread-id="buddy"]').count(), 1);
        assert.equal(await page.locator('[data-thread-id="base"]').count(), 0);
        await page.locator('[data-provider="codex"]').click();
        await page.locator('[data-thread-id="base"]').waitFor();
        await page.locator('#source-search').fill('FIRST');
        await page.waitForFunction(() => Boolean(window.pending.FIRST));
        await page.locator('#source-search').fill('SECOND');
        await page.locator('[data-thread-id="second"]').waitFor();
        await page.evaluate(() => { window.pending.FIRST.resolve({ threads: [{ id: 'wrong', title: 'FIRST stale' }], nextCursor: 'wrong-cursor' }); });
        assert.equal(await page.locator('[data-thread-id="wrong"]').count(), 0);
        await page.locator('#source-more').click();
        await page.locator('[data-thread-id="extra"]').waitFor();
        assert.equal(await page.locator('.source-row').count(), 2);
        assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), { executor: 'codex', cursor: 'more-SECOND', query: 'SECOND' });
        await page.locator('#source-search').fill('OLD_ERROR');
        await page.waitForFunction(() => Boolean(window.pending.OLD_ERROR));
        await page.locator('#source-search').fill('SECOND');
        await page.locator('[data-thread-id="second"]').waitFor();
        await page.evaluate(() => { window.pending.OLD_ERROR.reject(new Error('stale error')); });
        await page.waitForTimeout(30);
        assert.equal(await page.locator('#source-error').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => window.records), []);
        await page.locator('[data-thread-id="second"] button').click();
        assert.deepEqual(await page.evaluate(() => window.records), [{ executorId: 'codex', threadId: 'second' }]);
    }
    finally {
        await browser.close();
    }
    console.log(JSON.stringify({ status: "PASS_SYNTHETIC_SEARCH_UI", staleResponsesIgnored: true, paginationPreservesQuery: true, recordRequiresClick: true, actualCodexDesktopHandoff: false }));
})();
