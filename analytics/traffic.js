/* First-party attribution for the existing GA4 property. No chat API access. */
(function (w, d) {
  'use strict';
  if (w.RCTraffic) return;

  var SESSION_KEY = 'rc_traffic_session_v1';
  var FIRST_KEY = 'rc_traffic_first_v1';
  var SESSION_TTL = 30 * 60 * 1000;
  var FIRST_TTL = 90 * 24 * 60 * 60 * 1000;
  var localPreview = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(w.location.hostname);
  var diagnostics = localPreview && new URLSearchParams(w.location.search).get('traffic_debug') === '1';
  // Local preview must not contaminate the production property's reports.
  if (localPreview) w['ga-disable-G-SSLD98NGK9'] = true;
  var PROVIDERS = [
    ['deepseek', ['deepseek.com'], ['deepseek']],
    ['chatgpt', ['chatgpt.com', 'chat.openai.com'], ['chatgpt', 'openai']],
    ['claude', ['claude.ai'], ['claude', 'anthropic']],
    ['gemini', ['gemini.google.com', 'bard.google.com'], ['gemini', 'bard']],
    ['perplexity', ['perplexity.ai'], ['perplexity']],
    ['copilot', ['copilot.microsoft.com'], ['copilot', 'microsoftcopilot']],
    ['kimi', ['kimi.com', 'kimi.ai', 'kimi.moonshot.cn'], ['kimi', 'moonshot']],
    ['doubao', ['doubao.com'], ['doubao']],
    ['qwen', ['chat.qwen.ai', 'tongyi.aliyun.com', 'tongyi.com'], ['qwen', 'tongyi']],
    ['yuanbao', ['yuanbao.tencent.com'], ['yuanbao']],
    ['grok', ['grok.com'], ['grok']],
    ['wenxiaoyan', ['yiyan.baidu.com', 'wenxiaoyan.com'], ['wenxiaoyan', 'yiyan']],
    ['metaso', ['metaso.cn'], ['metaso']]
  ];

  function url(value) {
    try {
      var parsed = new URL(value);
      return /^https?:$/.test(parsed.protocol) ? parsed : null;
    } catch (_) { return null; }
  }
  function matches(host, domain) {
    return host === domain || host.endsWith('.' + domain);
  }
  function internal(host) {
    return matches(host, 'rexpandcareer.com') || host === w.location.hostname;
  }
  function provider(value) {
    value = value.toLowerCase().replace(/\.$/, '');
    for (var i = 0; i < PROVIDERS.length; i++) {
      var row = PROVIDERS[i];
      if (row[2].includes(value) || row[1].some(function (domain) { return matches(value, domain); })) return row[0];
    }
    return '';
  }
  function token(value) {
    value = (value || '').toLowerCase();
    var parsed = url(value);
    if (parsed) value = parsed.hostname;
    return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value) ? value : '';
  }
  function path() {
    var legacy = w.location.hash.match(/^#\/(article|replay)\/([a-z0-9_-]+)$/i);
    return legacy ? '/' + (legacy[1] === 'article' ? 'a-' : 'r-') + legacy[2] : w.location.pathname;
  }
  function pageURL() { return w.location.origin + path(); }

  // Only opaque conversation identifiers are retained, never search prompts,
  // query parameters, credentials or fragments. Most platforms send just origin.
  function conversation(ref, llm) {
    if (!ref || !llm) return '';
    var patterns = {
      deepseek: /^\/a\/chat\/s\/[a-f0-9-]{16,64}\/?$/i,
      chatgpt: /^\/(c|share)\/[a-f0-9-]{16,64}\/?$/i,
      claude: /^\/(chat|share)\/[a-f0-9-]{16,64}\/?$/i,
      gemini: /^\/(app|share)\/[a-f0-9-]{10,64}\/?$/i,
      kimi: /^\/chat\/[a-z0-9_-]{16,64}\/?$/i
    };
    return patterns[llm] && patterns[llm].test(ref.pathname) ? ref.origin + ref.pathname : '';
  }
  function cleanReferrer(ref) {
    if (!ref) return '';
    // LLM paths can contain the prompt (e.g. search-result slugs).
    var llm = provider(ref.hostname);
    return llm ? conversation(ref, llm) || ref.origin + '/' : ref.origin + ref.pathname;
  }
  function read(storage, key) {
    try { return JSON.parse(w[storage].getItem(key)); } catch (_) { return null; }
  }
  function write(storage, key, value) {
    try { w[storage].setItem(key, JSON.stringify(value)); } catch (_) { /* Private mode: use memory. */ }
  }
  function valid(touch) {
    return touch && typeof touch.source === 'string' && typeof touch.medium === 'string'
      && typeof touch.channel === 'string' && typeof touch.llm === 'string'
      && typeof touch.at === 'number' && typeof touch.landing === 'string';
  }
  var documentReferrer = url(d.referrer);
  var external = documentReferrer && !internal(documentReferrer.hostname) ? documentReferrer : null;
  var query = new URLSearchParams(w.location.search);
  var source = token(query.get('utm_source'));
  var medium = token(query.get('utm_medium'));

  function identify() {
    var sourceName = source || (external ? external.hostname.toLowerCase() : 'direct_unknown');
    var llm = provider(sourceName);
    var channel = llm ? 'ai_assistant' : 'referral';
    if (!source && !external) channel = 'direct_unknown';
    else if (!llm && medium === 'email') channel = 'email';
    else if (!llm && /^(cpc|ppc|paid|paid_search|paid_social)$/.test(medium)) channel = 'paid';
    else if (!llm && (medium === 'organic' || /^(www\.)?(google\.(com|com\.hk|co\.uk|ca|com\.au)|bing\.com|baidu\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(sourceName))) channel = 'organic_search';
    else if (!llm && source) channel = 'campaign';
    var convo = external && llm === provider(external.hostname) ? conversation(external, llm) : '';
    return {
      source: llm || sourceName,
      medium: medium || (llm ? 'ai-assistant' : channel === 'organic_search' ? 'organic'
        : external ? 'referral' : source ? '(not set)' : '(none)'),
      channel: channel,
      llm: llm,
      evidence: source ? 'utm' : external ? 'referrer' : 'none',
      referrer: cleanReferrer(external),
      referrerHost: external ? external.hostname : '',
      conversation: convo,
      landing: path(),
      at: Date.now()
    };
  }
  function newSession(touch) {
    return { touch: touch, lastActivity: Date.now(), landingSent: false };
  }
  var incoming = identify();
  var session = read('sessionStorage', SESSION_KEY);
  // Keep campaign forwarding (email -> offer), reloads and internal navigation
  // in one attribution visit. A different explicit source starts a new visit.
  var sameSource = session && valid(session.touch) && incoming.source === session.touch.source
    && incoming.medium === session.touch.medium
    && (!incoming.conversation || incoming.conversation === session.touch.conversation);
  if (!session || !valid(session.touch) || !Number.isFinite(session.lastActivity)
      || Date.now() - session.lastActivity >= SESSION_TTL || session.lastActivity > Date.now()
      || (incoming.evidence !== 'none' && !sameSource)) session = newSession(incoming);
  var first = read('localStorage', FIRST_KEY);
  if (!valid(first) || Date.now() - first.at >= FIRST_TTL || first.at > Date.now()) first = session.touch;
  write('localStorage', FIRST_KEY, first);

  function persist() { write('sessionStorage', SESSION_KEY, session); }
  persist();
  function context() {
    var t = session.touch;
    var params = {
      rc_source: t.source,
      rc_medium: t.medium,
      rc_channel: t.channel,
      rc_llm: t.llm || 'none',
      rc_evidence: t.evidence,
      rc_referrer_host: t.referrerHost || '(not provided)',
      rc_referrer_url: t.referrer || '(not provided)',
      rc_landing_path: t.landing,
      rc_first_source: first.source,
      rc_first_llm: first.llm || 'none',
      rc_conversation: t.conversation ? 'provided' : t.llm ? 'not_provided' : 'not_applicable'
    };
    if (t.conversation) params.rc_conversation_url = t.conversation;
    // GA4 custom string parameters have a 100-character limit.
    Object.keys(params).forEach(function (key) { params[key] = String(params[key]).slice(0, 100); });
    return params;
  }
  function emit(name, extra) {
    if (typeof w.gtag !== 'function') return;
    var params = Object.assign(context(), {
      send_to: 'G-SSLD98NGK9',
      page_location: pageURL(),
      page_title: d.title
    }, extra);
    if (diagnostics) w.console.info('[RC traffic] ' + name + ' ' + JSON.stringify(params));
    w.gtag('event', name, params);
  }
  function touch() {
    if (Date.now() - session.lastActivity >= SESSION_TTL) {
      // An idle open tab is a new direct/unknown visit, not a fresh LLM referral.
      session = newSession({ source: 'direct_unknown', medium: '(none)', channel: 'direct_unknown',
        llm: '', evidence: 'none', referrer: '', referrerHost: '', conversation: '', landing: path(), at: Date.now() });
    }
    session.lastActivity = Date.now();
    if (!session.landingSent && typeof w.gtag === 'function') {
      emit('traffic_landing');
      session.landingSent = true;
    }
    persist();
  }
  var lastPage = '';
  var pending;
  function pageView() {
    w.clearTimeout(pending);
    // Direct article/replay startup currently resolves in a 60ms router timer.
    // Debounce past it and any synchronous intermediate history replacements.
    pending = w.setTimeout(function () {
      var current = pageURL();
      if (current === lastPage) return;
      touch();
      emit('traffic_page_view', { page_referrer: lastPage || cleanReferrer(documentReferrer) });
      lastPage = current;
    }, 100);
  }

  w.RCTraffic = {
    context: function () { return Object.assign({}, context()); },
    config: function () {
      return Object.assign(context(), { page_referrer: cleanReferrer(documentReferrer) });
    }
  };
  ['pushState', 'replaceState'].forEach(function (method) {
    var original = w.history[method];
    w.history[method] = function () {
      var result = original.apply(this, arguments);
      pageView();
      return result;
    };
  });
  w.addEventListener('popstate', pageView);
  w.addEventListener('hashchange', pageView);
  w.addEventListener('pageshow', function (event) { if (event.persisted) { lastPage = ''; pageView(); } });
  function click(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    var link = event.target.closest && event.target.closest('a[href]');
    touch();
    if (!link) return;
    var target = url(link.href);
    if (!target || target.hostname !== 'work.weixin.qq.com' || !target.pathname.startsWith('/ca/')) return;
    var area = link.closest('main, nav, header, footer');
    emit('consult_click', {
      rc_button: (link.id || link.textContent.trim().replace(/\s+/g, ' ')).slice(0, 100),
      rc_placement: area ? area.id || area.tagName.toLowerCase() : 'other',
      link_url: target.origin + target.pathname
    });
  }
  d.addEventListener('click', click, true);
  d.addEventListener('auxclick', click, true);
  // Keep an actively read page alive without writing storage on every scroll.
  function activity() {
    if (Date.now() - session.lastActivity >= 15000) touch();
  }
  ['scroll', 'keydown', 'pointerdown'].forEach(function (event) {
    d.addEventListener(event, activity, { passive: true });
  });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', pageView, { once: true });
  else pageView();
})(window, document);
