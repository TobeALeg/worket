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
                return route.fulfill({ contentType: 'text/html', body: `<div id="recent-sources"></div><p id="source-error"></p><button id="record-history">History</button><dialog id="history-dialog"><span id="history-search-label"></span><input id="history-search"><select id="history-executor"></select><div id="history-sources"></div><p id="history-error"></p><button id="history-more">More</button><button id="history-close">Close</button><button id="history-retry">Retry</button></dialog><script type="module">import{setupRecordingSources}from'/renderer/recording-sources.js';setupRecordingSources(()=>{});</script>` });
            const path = resolve('dist', '.' + pathname);
            if (!path.startsWith(resolve('dist') + '/'))
                return route.abort();
            await route.fulfill({ contentType: 'text/javascript', body: await readFile(path, 'utf8') });
        });
        await page.addInitScript(() => {
            const g = window;
            g.calls = [];
            g.records = [];
            g.pending = {};
            const row = (id, title) => ({ id, title, executorId: 'codex', agentName: 'Codex', cwd: '/tmp/synthetic', updatedAt: new Date().toISOString() });
            g.workpet = { listExecutors: async () => [{ id: 'codex', name: 'Codex' }], distillation: async () => ({ required: false }), listRecentConversations: async () => ({ threads: [], errors: [] }),
                listConversationHistory: async (executor, cursor, query) => {
                    g.calls.push({ executor, cursor, query });
                    if (query === 'FIRST' || query === 'OLD_ERROR')
                        return new Promise((resolve, reject) => { g.pending[query] = { resolve, reject }; });
                    if (query === 'SECOND')
                        return { threads: cursor ? [row('second', 'SECOND result'), row('extra', 'SECOND extra')] : [row('second', 'SECOND result')], nextCursor: cursor ? null : 'more-SECOND' };
                    return { threads: [row('base', 'BASE')], nextCursor: 'more-BASE' };
                }, createWorkFromConversation: async (input) => { g.records.push(input); return {}; }, getDashboard: async () => ({}) };
        });
        await page.goto('http://worket-fixture.test/');
        await page.locator('#record-history').click();
        await page.locator('[data-thread-id="base"]').waitFor();
        await page.locator('#history-search').fill('FIRST');
        await page.waitForFunction(() => Boolean(window.pending.FIRST));
        await page.locator('#history-search').fill('SECOND');
        await page.locator('[data-thread-id="second"]').waitFor();
        await page.evaluate(() => { window.pending.FIRST.resolve({ threads: [{ id: 'wrong', title: 'FIRST stale' }], nextCursor: 'wrong-cursor' }); });
        await page.waitForFunction(() => document.querySelector('#history-executor')?.hasAttribute('disabled') === false);
        assert.equal(await page.locator('[data-thread-id="wrong"]').count(), 0);
        await page.locator('#history-more').click();
        await page.locator('[data-thread-id="extra"]').waitFor();
        assert.equal(await page.locator('.source-row').count(), 2);
        assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), { executor: 'codex', cursor: 'more-SECOND', query: 'SECOND' });
        await page.locator('#history-search').fill('OLD_ERROR');
        await page.waitForFunction(() => Boolean(window.pending.OLD_ERROR));
        await page.locator('#history-search').fill('SECOND');
        await page.locator('[data-thread-id="second"]').waitFor();
        await page.evaluate(() => { window.pending.OLD_ERROR.reject(new Error('stale error')); });
        await page.waitForTimeout(30);
        assert.equal(await page.locator('#history-error').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => window.records), []);
        await page.locator('[data-thread-id="second"] button').click();
        assert.deepEqual(await page.evaluate(() => window.records), [{ executorId: 'codex', threadId: 'second' }]);
    }
    finally {
        await browser.close();
    }
    console.log(JSON.stringify({ status: "PASS_SYNTHETIC_SEARCH_UI", staleResponsesIgnored: true, paginationPreservesQuery: true, recordRequiresClick: true, actualCodexDesktopHandoff: false }));
})();
