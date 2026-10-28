#!/usr/bin/env node
// AI-readiness audit for the KiteGEO skill: the same 11 checks and weights KiteGEO (lihaila.com/geo) uses.
// No dependencies; Node 18+. Runs on your machine and sends nothing anywhere except requests to the site itself.
//
//   node audit.mjs audit <url>                 score the site and list what to fix (JSON)
//   node audit.mjs robots <robots.txt file>    which AI crawlers a robots.txt (e.g. a draft fix) blocks
//   node audit.mjs jsonld <file.json>          check a JSON-LD block parses and has @context and @type
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; KiteGEOSkill/1.0; +https://lihaila.com/geo/)';
const MAX_BYTES = 2_000_000;

// AI crawlers worth allowing. "training" bots feed model memory; "search" bots feed live answers.
const AI_BOTS = [
  { ua: 'GPTBot', who: 'OpenAI', role: 'training' },
  { ua: 'OAI-SearchBot', who: 'ChatGPT search', role: 'search' },
  { ua: 'ChatGPT-User', who: 'ChatGPT browsing', role: 'search' },
  { ua: 'ClaudeBot', who: 'Anthropic', role: 'training' },
  { ua: 'Claude-SearchBot', who: 'Claude search', role: 'search' },
  { ua: 'PerplexityBot', who: 'Perplexity', role: 'search' },
  { ua: 'Google-Extended', who: 'Gemini', role: 'training' },
  { ua: 'Applebot-Extended', who: 'Apple Intelligence', role: 'training' },
  { ua: 'CCBot', who: 'Common Crawl (used by most LLMs)', role: 'training' },
];

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s)) return null; // not URL-like: treat as a brand
    s = 'https://' + s;
  }
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
}

const domainOf = (u) => u.hostname.replace(/^www\./, '').toLowerCase();

async function get(url, { timeout = 12000 } = {}) {
  const u = new URL(url);
  const t0 = Date.now();
  const res = await fetch(u, {
    headers: { 'user-agent': UA, accept: 'text/html,text/plain,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  const reader = res.body?.getReader();
  const chunks = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { reader.cancel(); break; }
    chunks.push(value);
  }
  return {
    status: res.status,
    ok: res.ok,
    url: res.url,
    ms: Date.now() - t0,
    type: res.headers.get('content-type') || '',
    body: Buffer.concat(chunks).toString('utf8'),
  };
}

const decode = (s) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

const metaContent = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] || '') : '';
};

function parseHtml(html) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '');
  const description = metaContent(html, 'name', 'description');
  const ogSiteName = metaContent(html, 'property', 'og:site_name');
  const ogTitle = metaContent(html, 'property', 'og:title');
  const lang = html.match(/<html[^>]+lang=["']([^"']+)/i)?.[1] || '';
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(html);
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => ({ level: +m[1], text: decode(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) }))
    .filter((h) => h.text);
  const jsonld = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonld.push(JSON.parse(m[1].trim())); } catch {}
  }
  const schemaTypes = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      const t = o['@type'];
      (Array.isArray(t) ? t : t ? [t] : []).forEach((x) => schemaTypes.add(String(x)));
      Object.values(o).forEach(walk);
    }
  };
  walk(jsonld);
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim();
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  return { title, description, ogSiteName, ogTitle, lang, canonical, headings, schemaTypes: [...schemaTypes], text, links };
}

/** Fetch and parse one page quickly (used to check a guessed website). Null when unreachable. */
async function fetchPage(url, timeout = 8000) {
  try {
    const r = await get(typeof url === 'string' ? url : url.href, { timeout });
    return r.ok && /html/i.test(r.type) ? { ...parseHtml(r.body), finalUrl: r.url } : null;
  } catch {
    return null;
  }
}

// Minimal robots.txt evaluation for the root path: is this bot disallowed from "/"?
function robotsBlocks(robots, ua) {
  const groups = [];
  let cur = null;
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === 'user-agent') {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(m[2].trim().toLowerCase());
    } else if (cur) cur.rules.push({ allow: k === 'allow', path: m[2].trim() });
  }
  const pick = (name) => groups.filter((g) => g.agents.includes(name));
  const matched = pick(ua.toLowerCase());
  const rules = (matched.length ? matched : pick('*')).flatMap((g) => g.rules);
  let verdict = null;
  let best = -1;
  for (const r of rules) {
    if (!r.path) continue;
    if ('/'.startsWith(r.path) || r.path === '/') {
      if (r.path.length > best || (r.path.length === best && r.allow)) { best = r.path.length; verdict = r.allow; }
    }
  }
  return verdict === false;
}

/** Fetch the home page and the AI-facing files, and score readiness 0–100. */
async function auditSite(url) {
  const u = typeof url === 'string' ? new URL(url) : url;
  const origin = u.origin;
  const [home, robots, llms, sitemap] = await Promise.all([
    get(u.href).catch((e) => ({ error: e.message })),
    get(origin + '/robots.txt', { timeout: 8000 }).catch(() => null),
    get(origin + '/llms.txt', { timeout: 8000 }).catch(() => null),
    get(origin + '/sitemap.xml', { timeout: 8000 }).catch(() => null),
  ]);
  if (home.error || !home.ok) {
    return { reachable: false, error: home.error || `Home page returned HTTP ${home.status}`, score: 0, checks: [] };
  }
  const page = parseHtml(home.body);
  const robotsText = robots?.ok && /user-agent/i.test(robots.body) ? robots.body : '';
  const blocked = robotsText ? AI_BOTS.filter((b) => robotsBlocks(robotsText, b.ua)) : [];
  // Only search bots fetch pages for live answers; blocking a training bot is a legitimate opt-out, not a defect.
  const searchBlocked = blocked.filter((b) => b.role === 'search').map((b) => b.ua);
  const trainingBlocked = blocked.filter((b) => b.role === 'training').map((b) => b.ua);
  const hasLlms = !!(llms?.ok && !/<html/i.test(llms.body.slice(0, 500)) && llms.body.trim().length > 20);
  const hasSitemap = !!(sitemap?.ok && /<(urlset|sitemapindex)/i.test(sitemap.body)) || /sitemap:/i.test(robotsText);
  const words = page.text.split(/\s+/).filter(Boolean).length;
  const h1 = page.headings.filter((h) => h.level === 1);
  const st = page.schemaTypes.map((t) => t.toLowerCase());
  const hasOrgSchema = st.some((t) => ['organization', 'corporation', 'localbusiness', 'softwareapplication', 'product', 'brand', 'website'].includes(t) || t.endsWith('business'));
  const hasFaq = st.includes('faqpage') || /frequently asked|faq/i.test(page.headings.map((h) => h.text).join(' '));
  const questionHeadings = page.headings.filter((h) => /\?$/.test(h.text)).length;
  const hasAbout = page.links.some((l) => /about|company|who-we-are/i.test(l));

  // weight = how much this signal matters for being read and cited by assistants
  const checks = [
    { id: 'crawlers', weight: 22, label: 'AI search crawlers allowed', pass: searchBlocked.length === 0,
      detail: (searchBlocked.length ? `robots.txt blocks ${searchBlocked.join(', ')}, so those assistants can't fetch the site for live answers` : 'No AI search crawler is blocked in robots.txt')
        + (trainingBlocked.length ? `. Training opt-out: ${trainingBlocked.join(', ')} (doesn't affect search answers)` : ''),
      data: { blocked: searchBlocked, optOut: trainingBlocked } },
    { id: 'ssr', weight: 16, label: 'Readable without JavaScript', pass: words >= 250,
      detail: `${words} words visible in raw HTML${words < 250 ? ' — AI crawlers mostly do not run JavaScript' : ''}`, data: { words } },
    { id: 'schema', weight: 14, label: 'Structured data (schema.org)', pass: hasOrgSchema,
      detail: page.schemaTypes.length ? `Found: ${page.schemaTypes.slice(0, 6).join(', ')}` : 'No JSON-LD found', data: { types: page.schemaTypes.slice(0, 6) } },
    { id: 'llms', weight: 8, label: 'llms.txt file', pass: hasLlms,
      detail: hasLlms ? 'Present' : 'Missing — a short Markdown guide to your site for AI agents' },
    { id: 'meta', weight: 10, label: 'Clear title & description', pass: !!page.title && page.description.length >= 50,
      detail: page.description ? `“${page.description.slice(0, 140)}”` : 'No meta description', data: { quote: page.description.slice(0, 140) } },
    { id: 'h1', weight: 6, label: 'One clear H1', pass: h1.length === 1,
      detail: h1.length ? `“${h1[0].text.slice(0, 90)}”${h1.length > 1 ? ` (+${h1.length - 1} more)` : ''}` : 'No H1 heading', data: { quote: h1[0]?.text.slice(0, 90) || '', extra: Math.max(0, h1.length - 1) } },
    { id: 'faq', weight: 8, label: 'Question-and-answer content', pass: hasFaq || questionHeadings >= 2,
      detail: hasFaq ? 'FAQ content found' : 'No FAQ — assistants love quoting direct Q&A' },
    { id: 'sitemap', weight: 6, label: 'Sitemap', pass: hasSitemap, detail: hasSitemap ? 'Found' : 'No sitemap.xml' },
    { id: 'about', weight: 4, label: 'About / company page', pass: hasAbout,
      detail: hasAbout ? 'Linked from home page' : 'No About page linked — weakens entity trust' },
    { id: 'https', weight: 3, label: 'HTTPS', pass: home.url.startsWith('https://'), detail: home.url.startsWith('https://') ? 'Secure connection' : 'Site is served over plain HTTP' },
    { id: 'speed', weight: 3, label: 'Fast response', pass: home.ms < 1500, detail: `${home.ms} ms`, data: { ms: home.ms } },
  ];
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0) / total) * 100);
  return {
    reachable: true,
    finalUrl: home.url,
    score,
    checks,
    blockedBots: blocked,
    page: {
      title: page.title,
      description: page.description,
      siteName: page.ogSiteName || page.ogTitle,
      lang: page.lang,
      headings: page.headings.slice(0, 25),
      schemaTypes: page.schemaTypes,
      text: page.text.slice(0, 6000),
      words,
    },
    robotsTxt: robotsText.slice(0, 4000),
  };
}

// ---- CLI ---------------------------------------------------------------------------
const out = (obj, code = 0) => { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); process.exit(code); };
const [cmd, arg] = process.argv.slice(2);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { out({ ok: false, error: `Couldn't read ${f}: ${e.message}` }, 1); } };

if (cmd === 'audit') {
  const u = normalizeUrl(arg);
  if (!u) out({ ok: false, error: 'Pass a website, e.g. node audit.mjs audit example.com' }, 1);
  const r = await auditSite(u);
  if (!r.reachable) out({ ok: false, error: r.error, url: u.href }, 1);
  out({
    ok: true, url: r.finalUrl, domain: domainOf(new URL(r.finalUrl)), score: r.score,
    checks: r.checks.map(({ id, label, weight, pass, detail }) => ({ id, label, weight, pass, detail })),
    blockedBots: r.blockedBots, page: r.page, robotsTxt: r.robotsTxt,
  });
} else if (cmd === 'robots') {
  const text = read(arg);
  const blocked = AI_BOTS.filter((b) => robotsBlocks(text, b.ua));
  const label = (b) => `${b.ua} (${b.who})`;
  out({
    ok: true,
    searchBlocked: blocked.filter((b) => b.role === 'search').map(label),
    trainingOptOut: blocked.filter((b) => b.role === 'training').map(label),
    allowed: AI_BOTS.filter((b) => !blocked.includes(b)).map((b) => b.ua),
  });
} else if (cmd === 'jsonld') {
  const text = read(arg).replace(/^\s*<script[^>]*>|<\/script>\s*$/gi, '');
  let data;
  try { data = JSON.parse(text); } catch (e) { out({ ok: false, error: `Not valid JSON: ${e.message}` }, 1); }
  const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
  const problems = [];
  if (!JSON.stringify(data).includes('schema.org')) problems.push('missing "@context": "https://schema.org"');
  items.forEach((it, i) => { if (!it?.['@type']) problems.push(`item ${i + 1} has no @type`); });
  out({ ok: !problems.length, types: items.map((it) => it?.['@type']).filter(Boolean), problems });
} else {
  out({ ok: false, error: 'Commands: audit <url> | robots <file> | jsonld <file>' }, 1);
}
