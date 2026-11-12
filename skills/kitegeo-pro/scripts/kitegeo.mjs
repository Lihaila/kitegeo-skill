#!/usr/bin/env node
// KiteGEO API client for the KiteGEO Pro skill. No dependencies; Node 18+.
//
//   node kitegeo.mjs login <key>            save the API key (lihaila.com/geo → Dashboard → Use KiteGEO in AI agents)
//   node kitegeo.mjs me                     account, plan, reports and tracked brands
//   node kitegeo.mjs prepare --site <url or brand> [--keywords "…"] [--lang en|cn|jp|kr]
//                                           read the site; returns the brand profile, competitors and proposed buyer questions
//   node kitegeo.mjs run --scan <id> [--questions q.json] [--brand "…"] [--competitors "a,b,c"]
//                                           start the check (free check: 5 questions × every assistant)
//   node kitegeo.mjs report --scan <id> [--wait]   the report (waits until it's done with --wait)
//   node kitegeo.mjs plan --scan <id> [--wait]     the action plan (Full Report only)
//   node kitegeo.mjs track --scan <id>             track the brand weekly (Pro / Agency plans)
//   node kitegeo.mjs rescan --project <id>         re-scan a tracked brand now
//
// Publishing toolkit (any paid plan; add --brand <key> for another brand, --as <owner id> for an agency):
//   node kitegeo.mjs toolkit                        sites, briefs, threads to answer, articles, "is it working?"
//   node kitegeo.mjs find                           search for new sites and threads now (once a day)
//   node kitegeo.mjs draft --brief <n>              draft an article from action-plan brief n
//   node kitegeo.mjs publish --title "…" --file article.md [--sites a.com,b.com] [--tags "a,b"] [--canonical <url>]
//                                                   post to the sites (default: the selected ones); API sites go live now
//   node kitegeo.mjs posted --post <id> --url <link>   record where a by-hand post went live (--retry to retry a failed one)
//   node kitegeo.mjs answer --thread <id>           draft an answer to a forum thread
//   node kitegeo.mjs answered --thread <id> [--url <link>] | dismiss --thread <id>
//
// q.json: a JSON array of questions, as strings or {"q": "...", "branded": false}.
// Output is JSON on stdout; progress goes to stderr. Exit codes: 0 ok, 1 error, 2 needs action
// (no key, free checks used up, report not bought, plan needed): the JSON's "action" says what to do.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.env.KITEGEO_URL || 'https://lihaila.com/geo').replace(/\/+$/, '');
const KEY_FILE = path.join(os.homedir(), '.config', 'kitegeo', 'key');
const DASH = `${BASE}/en/dashboard (sign in → Use KiteGEO in AI agents → Create a key)`;
const PRICING = `${BASE}/en/pricing`;
const reportUrl = (id) => `${BASE}/en/r/${id}`;

const out = (obj, code = 0) => { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); process.exit(code); };
const needs = (action, message, extra = {}) => out({ ok: false, action, message, ...extra }, 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function args(list) {
  const o = { _: [] };
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) o[list[i].slice(2)] = list[i + 1]?.startsWith('--') || list[i + 1] === undefined ? true : list[++i];
    else o._.push(list[i]);
  }
  return o;
}

function readKey() {
  if (process.env.KITEGEO_API_KEY) return process.env.KITEGEO_API_KEY.trim();
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { return ''; }
}

function need(v, flag) {
  if (!v || v === true) out({ ok: false, error: `Pass --${flag}.` }, 1);
  return String(v);
}

/** A refused request → what the user has to do. */
function refused(status, body, scanId) {
  const msg = (body?.error || `HTTP ${status}`).replace(/([^.!?。！？])\s*$/, '$1.');
  if (body?.code === 'badkey' || status === 401) needs('create_key', `${msg} Create a key at ${DASH}, then run: node kitegeo.mjs login <key>`);
  if (status === 402) needs('buy_report', `${msg} Buy the Full Report on the report page: ${scanId ? reportUrl(scanId) : PRICING}`);
  if (status === 429) needs('quota', `${msg} Free checks are limited per day. A Full Report or the Pro plan has no daily limit: ${PRICING}`);
  if (status === 403 && /plan|Pro|Agency/i.test(msg)) needs('upgrade', `${msg} Plans: ${PRICING}`);
  out({ ok: false, status, error: msg }, 1);
}

async function call(p, { method = 'GET', body, lang } = {}) {
  const key = readKey();
  if (!key) needs('create_key', `No KiteGEO API key yet. Create one at ${DASH}, then run: node kitegeo.mjs login <key>`);
  try {
    return await fetch(`${BASE}/api/${p}`, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(lang ? { 'x-geo-lang': lang } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    out({ ok: false, error: `Couldn't reach ${BASE}: ${e.message}` }, 1);
  }
}
async function getJSON(p, opts, scanId) {
  const res = await call(p, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) refused(res.status, body, scanId);
  return body;
}

/** The report, trimmed for reading in chat: answers are shortened, the rest is as the site shows it. */
function shape(r) {
  return {
    scanId: r.id, status: r.status, progress: r.progress, step: r.step, error: r.error || undefined,
    tier: r.tier, unlocked: r.unlocked, reportUrl: reportUrl(r.id),
    brand: r.profile?.brand, domain: r.domain, competitors: r.profile?.competitors,
    questions: (r.prompts || []).map((p) => p.q ?? p),
    aiReadiness: r.audit && { score: r.audit.score, blockedBots: r.audit.blockedBots, checks: r.audit.checks },
    result: r.result,
    answers: (r.answers || []).map((a) => ({ question: r.prompts?.[a.promptIdx]?.q, engine: a.engine, mode: a.mode,
      text: a.text ? (a.text.length > 1200 ? a.text.slice(0, 1200) + '…' : a.text) : null, error: a.error || undefined,
      analysis: a.analysis, citations: a.citations })),
    lockedAnswers: r.lockedAnswers || undefined,
    ...(r.unlocked ? {} : { unlock: `Competitors past the top 3, the other answers, cited sources and the action plan are in the Full Report: ${reportUrl(r.id)}` }),
  };
}

const [cmd, ...rest] = process.argv.slice(2);
const a = args(rest);

switch (cmd) {
  case 'login': {
    const key = String(a._[0] || '').trim();
    if (!/^kg_[A-Za-z0-9_-]{20,}$/.test(key)) out({ ok: false, error: 'That doesn\'t look like a KiteGEO key (it starts with kg_).' }, 1);
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, key + '\n', { mode: 0o600 });
    const me = await getJSON('me');
    out({ ok: true, saved: KEY_FILE, email: me.user?.email, plan: me.user?.planActive ? me.user.plan : 'free' });
  }
  case 'me': {
    const me = await getJSON('me');
    out({
      ok: true, email: me.user?.email, plan: me.user?.planActive ? me.user.plan : 'free', planUntil: me.user?.planUntil || undefined,
      planInfo: me.planInfo || undefined,
      reports: (me.scans || []).map((s) => ({ scanId: s.id, createdAt: new Date(s.createdAt).toISOString().slice(0, 10), site: s.domain || s.input, tier: s.tier, status: s.status, score: s.score, url: reportUrl(s.id) })),
      trackedBrands: (me.projects || []).map((p) => ({ projectId: p.id, brand: p.profile?.brand, domain: p.domain, latestScore: p.history.at(-1)?.score ?? null, latestScanId: p.latestScanId, nextScan: p.nextRunAt && new Date(p.nextRunAt).toISOString().slice(0, 10) })),
      pricing: PRICING,
    });
  }
  case 'prepare': {
    process.stderr.write('[kitegeo] reading the site and writing buyer questions (about 20–40 s)…\n');
    const r = await getJSON('prepare', { method: 'POST', body: { input: need(a.site, 'site'), keywords: a.keywords === true ? '' : a.keywords }, lang: a.lang });
    out({ ok: true, scanId: r.id, profile: r.profile, questions: r.prompts, aiReadinessScore: r.audit?.score ?? null,
      next: `Show these to the user, then: node kitegeo.mjs run --scan ${r.id} [--questions q.json] [--competitors "a,b"]` });
  }
  case 'run': {
    const scanId = need(a.scan, 'scan');
    let questions;
    if (a.questions && a.questions !== true) {
      try { questions = JSON.parse(fs.readFileSync(a.questions, 'utf8')); } catch (e) { out({ ok: false, error: `Couldn't read ${a.questions}: ${e.message}` }, 1); }
      questions = (Array.isArray(questions) ? questions : []).map((q) => (typeof q === 'string' ? { q, branded: false } : { q: String(q.q || ''), branded: !!q.branded }));
    } else {
      // The proposed questions, as prepared.
      questions = (await getJSON(`scan/${scanId}`, {}, scanId)).prompts;
    }
    const body = { prompts: questions };
    if (a.brand && a.brand !== true) body.brand = a.brand;
    if (a.competitors && a.competitors !== true) body.competitors = String(a.competitors).split(',').map((s) => s.trim()).filter(Boolean);
    await getJSON(`scan/${scanId}/run`, { method: 'POST', body }, scanId);
    out({ ok: true, scanId, started: true, reportUrl: reportUrl(scanId), next: `node kitegeo.mjs report --scan ${scanId} --wait  (a free check takes about a minute)` });
  }
  case 'report': {
    const scanId = need(a.scan, 'scan');
    let r = await getJSON(`scan/${scanId}`, {}, scanId);
    const t0 = Date.now();
    while (a.wait && ['queued', 'running'].includes(r.status) && Date.now() - t0 < 15 * 60_000) {
      process.stderr.write(`[kitegeo] ${Math.round((r.progress || 0) * 100)}% ${r.step || r.status}…\n`);
      await sleep(5000);
      r = await getJSON(`scan/${scanId}`, {}, scanId);
    }
    if (r.status === 'draft') needs('run_first', `This check hasn't started. Run: node kitegeo.mjs run --scan ${scanId}`);
    out({ ok: r.status !== 'error', ...shape(r) }, r.status === 'error' ? 1 : 0);
  }
  case 'plan': {
    const scanId = need(a.scan, 'scan');
    let p = await getJSON(`scan/${scanId}/plan`, { method: 'POST' }, scanId);
    const t0 = Date.now();
    while (a.wait && p.status === 'running' && Date.now() - t0 < 10 * 60_000) {
      process.stderr.write('[kitegeo] writing the action plan…\n');
      await sleep(6000);
      p = await getJSON(`scan/${scanId}/plan`, { method: 'POST' }, scanId);
    }
    out({ ok: p.status !== 'error', status: p.status, plan: p.plan, reportUrl: reportUrl(scanId) }, p.status === 'error' ? 1 : 0);
  }
  case 'track': {
    const scanId = need(a.scan, 'scan');
    const r = await getJSON('projects', { method: 'POST', body: { scanId } }, scanId);
    out({ ok: true, projectId: r.id, note: 'Weekly scans start now; the first one is running.' });
  }
  case 'rescan': {
    const r = await getJSON(`projects/${need(a.project, 'project')}/rescan`, { method: 'POST' });
    out({ ok: true, scanId: r.scanId, next: `node kitegeo.mjs report --scan ${r.scanId} --wait` });
  }
  // ---- Publishing toolkit (paid plans). --brand <key> picks the brand (default: the main one);
  //      --as <owner id> works in an agency's toolkit as one of its operators.
  case 'toolkit': {
    const t = await toolkit();
    const open = t.threads.filter((x) => x.status !== 'answered');
    out({
      ok: true, brand: t.brand, brands: t.brands, toolkitUrl: `${BASE}/en/publish`,
      siteSearch: t.discovery,
      sites: t.sites.map((s) => ({ domain: s.domain, name: s.name, selected: s.selected, oneClick: s.connected, lang: s.lang, citedByAI: s.cites, inSearch: s.hits })),
      connectAccountsAt: `${BASE}/en/publish/accounts`,
      briefs: t.briefs.map((b, i) => ({ n: i + 1, title: b.title, question: b.target_question })),
      threadsToAnswer: open.map((x) => ({ id: x.id, site: x.site, title: x.title, url: x.url, question: x.question, hasDraft: !!x.answer })),
      articles: t.articles.filter((x) => x.brand === t.brand).slice(0, 20).map((x) => ({ id: x.id, title: x.title, createdAt: new Date(x.createdAt).toISOString().slice(0, 10), by: x.by,
        posts: x.posts.map((p) => ({ id: p.id, site: p.domain, status: p.status, url: p.url, citedByAI: p.cited || 0, error: p.error || undefined })) })),
      isItWorking: t.impact,
    });
  }
  case 'find': {
    const t = await toolkit('publish/discover', { method: 'POST' });
    out({ ok: true, siteSearch: t.discovery, note: 'Runs in the background (about a minute). Then run: node kitegeo.mjs toolkit' });
  }
  case 'draft': {
    const t = await toolkit();
    const b = t.briefs[Number(need(a.brief, 'brief')) - 1];
    if (!b) out({ ok: false, error: `No brief ${a.brief}. "toolkit" lists them (${t.briefs.length}).` }, 1);
    process.stderr.write('[kitegeo] writing the draft (about a minute)…\n');
    const d = await getJSON('publish/draft', { method: 'POST', body: { ...ws(), scanId: b.scanId, title: b.title } });
    out({ ok: true, title: d.title, tags: d.tags, body: d.body, note: 'A draft: check the facts and fill in every [placeholder] with the user before publishing.' });
  }
  case 'publish': {
    const body = fs.readFileSync(need(a.file, 'file'), 'utf8');
    const t = await toolkit();
    const domains = a.sites && a.sites !== true ? String(a.sites).split(',').map((x) => x.trim()) : t.sites.filter((s) => s.selected).map((s) => s.domain);
    const r = await getJSON('publish/articles', { method: 'POST', body: { ...ws(), title: need(a.title, 'title'), body, tags: a.tags === true ? '' : a.tags || '', canonicalUrl: a.canonical || null, domains } });
    const art = r.articles.find((x) => x.id === r.articleId);
    out({
      ok: true, articleId: r.articleId,
      live: art.posts.filter((p) => p.status === 'posted').map((p) => ({ site: p.domain, url: p.url })),
      failed: art.posts.filter((p) => p.status === 'error').map((p) => ({ postId: p.id, site: p.domain, error: p.error })),
      toPostByHand: art.posts.filter((p) => p.status === 'manual').map((p) => ({ postId: p.id, site: p.domain, editor: r.sites.find((s) => s.domain === p.domain)?.submitUrl })),
      handOff: `Sites without an API are posted by the user: ${BASE}/en/publish/articles ("Copy & open"). Afterwards: node kitegeo.mjs posted --post <postId> --url <link>`,
    });
  }
  case 'posted': {
    await getJSON(`publish/posts/${need(a.post, 'post')}`, { method: 'POST', body: { ...ws(), ...(a.retry ? { retry: true } : { url: need(a.url, 'url') }) } });
    out({ ok: true });
  }
  case 'answer': {
    process.stderr.write('[kitegeo] drafting the answer…\n');
    const t = await getJSON(`publish/threads/${need(a.thread, 'thread')}/draft`, { method: 'POST', body: ws() });
    const th = t.threads.find((x) => x.id === a.thread);
    out({ ok: true, thread: th.url, title: th.title, answer: th.answer,
      note: 'The user posts this from their own account (forums ban automated posting), keeping the disclosure line. Then: node kitegeo.mjs answered --thread <id> --url <link>' });
  }
  case 'answered':
  case 'dismiss': {
    await getJSON(`publish/threads/${need(a.thread, 'thread')}`, { method: 'POST', body: { ...ws(), status: cmd === 'answered' ? 'answered' : 'dismissed', url: a.url === true ? '' : a.url || '' } });
    out({ ok: true });
  }
  default:
    out({ ok: false, error: 'Commands: login <key> | me | prepare --site … | run --scan … | report --scan … [--wait] | plan --scan … [--wait] | track --scan … | rescan --project … | toolkit | find | draft --brief <n> | publish --title … --file … [--sites a,b] | posted --post … --url … | answer --thread … | answered --thread … [--url …] | dismiss --thread …' }, 1);
}

// Brand / agency workspace for toolkit calls.
function ws() { return { brand: a.brand && a.brand !== true ? String(a.brand) : '', as: a.as && a.as !== true ? String(a.as) : '' }; }
async function toolkit(p = 'publish', opts = {}) {
  if (opts.method) return getJSON(p, { ...opts, body: { ...ws(), ...(opts.body || {}) } });
  const q = new URLSearchParams(Object.entries(ws()).filter(([, v]) => v)).toString();
  return getJSON(q ? `${p}?${q}` : p);
}
