// Run with node --test scripts/traffic-attribution.test.mjs. No network/GA writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const code = fs.readFileSync('analytics/traffic.js', 'utf8');
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

function browser({ href = 'https://rexpandcareer.com/', referrer = '', sessionStorage = storage(),
  localStorage = storage(), now = 1800000000000, blockedStorage = false } = {}) {
  let location = new URL(href);
  const events = [], listeners = {}, timers = new Map();
  let serial = 0, timerClock = 0;
  class Clock extends Date { static now() { return now; } }
  const listen = (type, callback) => (listeners[type] ??= []).push(callback);
  const document = { referrer, title: 'Rexpand', readyState: 'loading', addEventListener: listen };
  const window = {
    console: { info: (...args) => events.push(['console', ...args]) },
    get location() { return location; },
    gtag: (...args) => events.push(args),
    addEventListener: listen,
    history: Object.fromEntries(['pushState', 'replaceState'].map(method => [method, function (_state, _unused, href) {
      assert.equal(this, window.history, 'History receiver must be preserved');
      if (href != null) location = new URL(href, location);
    }])),
    setTimeout: (callback, delay = 0) => { timers.set(++serial, { callback, due: timerClock + delay }); return serial; },
    clearTimeout: id => timers.delete(id),
    get sessionStorage() { if (blockedStorage) throw new Error('storage disabled'); return sessionStorage; },
    get localStorage() { if (blockedStorage) throw new Error('storage disabled'); return localStorage; }
  };
  const context = vm.createContext({ window, document, URL, URLSearchParams, Date: Clock });
  vm.runInContext(code, context);
  const dispatch = (type, event = {}) => { for (const callback of listeners[type] ?? []) callback({ type, ...event }); };
  const flush = () => {
    while (timers.size) {
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
      timers.delete(id); timerClock = timer.due; timer.callback();
    }
  };
  const ready = () => { document.readyState = 'complete'; dispatch('DOMContentLoaded'); flush(); };
  const consult = ({ button = 0, type = 'click', href = 'https://work.weixin.qq.com/ca/test?unwanted=secret' } = {}) => {
    const area = { id: 'page-offer', tagName: 'MAIN' };
    const link = { href, id: '', textContent: '预约求职咨询 →', closest: () => area };
    dispatch(type, { button, target: { closest: () => link } });
  };
  return { window, document, events, ready, flush, dispatch, consult, sessionStorage, localStorage,
    advance: ms => { now += ms; }, rerun: () => vm.runInContext(code, context),
    params: () => JSON.parse(JSON.stringify(window.RCTraffic.context())),
    event: name => events.filter(item => item[0] === 'event' && item[1] === name).map(item => item[2]) };
}

test('recognizes LLM referrers without matching lookalike domains', () => {
  const hosts = {
    'chat.deepseek.com': 'deepseek', 'chatgpt.com': 'chatgpt', 'chat.openai.com': 'chatgpt',
    'claude.ai': 'claude', 'gemini.google.com': 'gemini', 'www.perplexity.ai': 'perplexity',
    'copilot.microsoft.com': 'copilot', 'www.kimi.com': 'kimi', 'kimi.moonshot.cn': 'kimi',
    'www.doubao.com': 'doubao', 'chat.qwen.ai': 'qwen', 'tongyi.aliyun.com': 'qwen',
    'yuanbao.tencent.com': 'yuanbao', 'grok.com': 'grok', 'yiyan.baidu.com': 'wenxiaoyan', 'metaso.cn': 'metaso'
  };
  for (const [host, llm] of Object.entries(hosts)) {
    const b = browser({ referrer: 'https://' + host + '/' });
    b.ready();
    assert.equal(b.params().rc_llm, llm, host);
    assert.equal(b.params().rc_channel, 'ai_assistant');
    assert.equal(b.params().rc_evidence, 'referrer');
    assert.equal(b.params().rc_conversation, 'not_provided');
    assert.equal(b.event('traffic_landing').length, 1);
  }
  for (const host of ['deepseek.com.evil.com', 'notchatgpt.com', 'google.com', 'bing.com', 'x.com']) {
    assert.equal(browser({ referrer: 'https://' + host }).params().rc_llm, 'none', host);
  }
});

test('UTM source takes precedence; referrer remains separate evidence', () => {
  const b = browser({ href: 'https://rexpandcareer.com/offer?utm_source=deepseek&utm_medium=ai-assistant',
    referrer: 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc' });
  assert.equal(b.params().rc_source, 'deepseek');
  assert.equal(b.params().rc_evidence, 'utm');
  assert.equal(b.params().rc_referrer_host, 'chatgpt.com');
  assert.equal(b.params().rc_conversation, 'not_provided', 'Never label another platform chat as DeepSeek');
  const c = browser({ href: 'https://rexpandcareer.com/?utm_source=ChatGPT.com&utm_medium=referral' });
  assert.equal(c.params().rc_llm, 'chatgpt');
});

test('direct, search, paid, email and other referring sites stay distinct', () => {
  assert.equal(browser().params().rc_channel, 'direct_unknown');
  for (const host of ['www.rexpandcareer.com', 'student.rexpandcareer.com']) {
    assert.equal(browser({ referrer: 'https://' + host + '/offer' }).params().rc_channel, 'direct_unknown');
  }
  assert.equal(browser({ referrer: 'https://www.google.com/search?q=secret' }).params().rc_channel, 'organic_search');
  assert.equal(browser({ referrer: 'https://www.google.com/search?q=secret' }).params().rc_medium, 'organic');
  assert.equal(browser({ href: 'https://rexpandcareer.com/?utm_source=google&utm_medium=cpc' }).params().rc_channel, 'paid');
  assert.equal(browser({ href: 'https://rexpandcareer.com/?utm_source=newsletter&utm_medium=email' }).params().rc_channel, 'email');
  assert.equal(browser({ referrer: 'https://example.org/blog?email=secret#private' }).params().rc_referrer_url, 'https://example.org/blog');
});

test('only supplied opaque conversation URLs survive; prompts, secrets and fragments do not', () => {
  const chat = 'https://chat.deepseek.com/a/chat/s/12345678-1234-1234-1234-123456789abc';
  const b = browser({ referrer: chat + '?token=secret#prompt', href: 'https://rexpandcareer.com/offer?email=private' });
  b.ready();
  assert.equal(b.params().rc_conversation_url, chat);
  assert.equal(b.params().rc_conversation, 'provided');
  assert.equal(b.event('traffic_page_view')[0].page_location, 'https://rexpandcareer.com/offer');
  assert.doesNotMatch(JSON.stringify(b.events), /secret|private|prompt/);
  const p = browser({ referrer: 'https://www.perplexity.ai/search/my-private-prompt-123?query=secret' });
  assert.equal(p.params().rc_referrer_url, 'https://www.perplexity.ai/');
  assert.equal(p.params().rc_conversation, 'not_provided');
  for (const referrer of ['not a URL', 'javascript:alert(1)', 'file:///private/data']) {
    assert.equal(browser({ referrer }).params().rc_source, 'direct_unknown');
  }
});

test('internal reloads preserve source, landing page and one landing event', () => {
  const b = browser({ href: 'https://rexpandcareer.com/a-test', referrer: 'https://chat.deepseek.com/' });
  b.ready();
  const next = browser({ href: 'https://rexpandcareer.com/offer', referrer: 'https://rexpandcareer.com/a-test',
    sessionStorage: b.sessionStorage, localStorage: b.localStorage });
  next.ready();
  assert.equal(next.params().rc_source, 'deepseek');
  assert.equal(next.params().rc_landing_path, '/a-test');
  assert.equal(next.event('traffic_landing').length, 0);
  next.consult();
  assert.equal(next.event('consult_click')[0].rc_source, 'deepseek');
  assert.equal(next.event('consult_click')[0].rc_placement, 'page-offer');
  assert.equal(next.event('consult_click')[0].link_url, 'https://work.weixin.qq.com/ca/test');
});

test('early email redirect preserves attribution and defers landing until GA exists', () => {
  const root = browser({ href: 'https://rexpandcareer.com/?utm_source=newsletter&utm_medium=email' });
  const email = browser({ href: 'https://rexpandcareer.com/email.html?utm_source=newsletter&utm_medium=email',
    sessionStorage: root.sessionStorage, localStorage: root.localStorage });
  email.ready();
  assert.equal(email.params().rc_landing_path, '/');
  assert.equal(email.event('traffic_landing').length, 1);
  assert.equal(root.event('traffic_landing').length, 0);
});

test('new attribution visits preserve first touch and expire after 30 minutes', () => {
  const b = browser({ referrer: 'https://chat.deepseek.com/' });
  b.ready();
  const c = browser({ referrer: 'https://claude.ai/', sessionStorage: b.sessionStorage, localStorage: b.localStorage });
  c.ready();
  assert.equal(c.params().rc_source, 'claude');
  assert.equal(c.params().rc_first_source, 'deepseek');
  assert.equal(c.event('traffic_landing').length, 1);
  c.advance(30 * 60 * 1000);
  c.consult();
  assert.equal(c.event('consult_click')[0].rc_source, 'direct_unknown');
  assert.equal(c.event('consult_click')[0].rc_first_llm, 'deepseek');
  assert.equal(c.event('traffic_landing').length, 2);
});

test('active reading keeps the attribution visit alive; first touch expires after 90 days', () => {
  const b = browser({ referrer: 'https://chat.deepseek.com/' });
  b.ready();
  b.advance(29 * 60 * 1000); b.dispatch('scroll');
  b.advance(29 * 60 * 1000); b.consult();
  assert.equal(b.event('consult_click')[0].rc_source, 'deepseek');
  const c = browser({ now: 1800000000000 + 91 * 24 * 60 * 60 * 1000,
    referrer: 'https://claude.ai/', sessionStorage: b.sessionStorage, localStorage: b.localStorage });
  assert.equal(c.params().rc_first_source, 'claude');
});

test('SPA updates coalesce to final URL, preserve navigation and avoid duplicate views', () => {
  const b = browser({ referrer: 'https://chat.deepseek.com/' });
  b.ready();
  b.window.history.pushState({}, '', '/resources');
  b.window.history.replaceState({}, '', '/a-example');
  b.document.title = 'Example article';
  b.flush();
  assert.equal(b.event('traffic_page_view').length, 2);
  assert.equal(b.event('traffic_page_view')[1].page_location, 'https://rexpandcareer.com/a-example');
  assert.equal(b.event('traffic_page_view')[1].page_title, 'Example article');
  assert.equal(b.event('traffic_page_view')[1].page_referrer, 'https://rexpandcareer.com/');
  b.dispatch('popstate'); b.flush();
  assert.equal(b.event('traffic_page_view').length, 2);
  b.window.history.pushState({}, '', '/offer'); b.flush();
  assert.equal(b.event('traffic_page_view')[2].rc_source, 'deepseek');
  b.dispatch('pageshow', { persisted: true }); b.flush();
  assert.equal(b.event('traffic_page_view').length, 4);
  assert.equal(b.event('traffic_landing').length, 1);
});

test('legacy article hashes map to clean pages; section anchors are not page views', () => {
  const b = browser({ href: 'https://rexpandcareer.com/#/article/example' });
  b.ready();
  assert.equal(b.event('traffic_page_view')[0].page_location, 'https://rexpandcareer.com/a-example');
  b.window.history.replaceState({}, '', '/a-example#section'); b.flush();
  assert.equal(b.event('traffic_page_view').length, 1);
});

test('direct article bootstrap records its final title once, after the delayed render', () => {
  const b = browser({ href: 'https://rexpandcareer.com/a-example' });
  b.dispatch('DOMContentLoaded');
  b.window.setTimeout(() => {
    b.document.title = 'Final article title';
    b.window.history.pushState({}, '', '/resources');
    b.window.history.replaceState({}, '', '/a-example');
  }, 60);
  b.flush();
  assert.equal(b.event('traffic_page_view').length, 1);
  assert.equal(b.event('traffic_page_view')[0].page_title, 'Final article title');
});

test('storage failures, missing GA and duplicate script loading do not break navigation', () => {
  const b = browser({ blockedStorage: true, referrer: 'https://chat.deepseek.com/' });
  b.rerun(); b.ready();
  assert.equal(b.event('traffic_page_view').length, 1);
  b.consult({ type: 'auxclick', button: 1 });
  assert.equal(b.event('consult_click').length, 1);
  b.consult({ type: 'auxclick', button: 2 });
  assert.equal(b.event('consult_click').length, 1);
  b.window.gtag = undefined;
  assert.doesNotThrow(() => { b.window.history.pushState({}, '', '/offer'); b.flush(); b.consult(); });
});

test('local diagnostics disable production collection but expose real event parameters', () => {
  const b = browser({ href: 'http://localhost:8765/?traffic_debug=1&utm_source=deepseek' });
  b.ready(); b.consult();
  assert.equal(b.window['ga-disable-G-SSLD98NGK9'], true);
  assert.equal(b.events.filter(item => item[0] === 'console').length, 3);
  assert.ok(b.events.find(item => item[0] === 'console' && item[1].includes('consult_click')));
});

test('a different supplied conversation from the same LLM starts a new attribution visit', () => {
  const prefix = 'https://chatgpt.com/c/';
  const b = browser({ referrer: prefix + '12345678-1234-1234-1234-123456789abc' });
  b.ready();
  const c = browser({ referrer: prefix + '87654321-4321-4321-4321-abcdef123456',
    sessionStorage: b.sessionStorage, localStorage: b.localStorage });
  c.ready();
  assert.equal(c.event('traffic_landing').length, 1);
  assert.equal(c.params().rc_conversation_url, prefix + '87654321-4321-4321-4321-abcdef123456');
});

test('corrupt storage recovers and a late GA bootstrap can still record landing', () => {
  const bad = storage();
  bad.setItem('rc_traffic_session_v1', '{bad JSON');
  bad.setItem('rc_traffic_first_v1', '{"at":123}');
  const b = browser({ sessionStorage: bad, localStorage: bad });
  const gtag = b.window.gtag;
  b.window.gtag = undefined;
  b.ready();
  assert.equal(b.event('traffic_landing').length, 0);
  b.window.gtag = gtag;
  b.consult();
  assert.equal(b.event('traffic_landing').length, 1);
});

test('both entrypoints capture before GA config and deployment includes the asset', () => {
  for (const name of ['index.html', 'email.html']) {
    const html = fs.readFileSync(name, 'utf8');
    assert.ok(html.includes('window.RCTraffic.config()'));
    assert.ok(html.includes('gtag/js?id=G-SSLD98NGK9'));
    assert.ok(html.includes("gtag('config', 'G-SSLD98NGK9'"));
    assert.ok(html.indexOf('src="/analytics/traffic.js"') < html.indexOf("gtag('config'"));
  }
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(Buffer.byteLength(html.slice(0, html.indexOf('<meta charset'))) < 1024);
  assert.ok(html.indexOf('src="/analytics/traffic.js"') < html.indexOf('location.replace'));
  assert.ok(fs.readFileSync('.github/workflows/deploy.yml', 'utf8').includes('cp -r analytics dist/'));
  const b = browser();
  b.ready(); b.consult();
  for (const event of b.events.filter(item => item[0] === 'event')) {
    assert.equal(event[2].send_to, 'G-SSLD98NGK9', event[1] + ' must reach the configured property');
  }
});
