#!/usr/bin/env node
// KiteGEO API client for the KiteGEO Pro skill. No dependencies; Node 18+.
//
//   node kitegeo.mjs login <key>            save the API key (lihaila.com/geo → Dashboard → Use KiteGEO in Claude)
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
// q.json: a JSON array of questions, as strings or {"q": "...", "branded": false}.
// Output is JSON on stdout; progress goes to stderr. Exit codes: 0 ok, 1 error, 2 needs action
// (no key, free checks used up, report not bought, plan needed): the JSON's "action" says what to do.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.env.KITEGEO_URL || 'https://lihaila.com/geo').replace(/\/+$/, '');
const KEY_FILE = path.join(os.homedir(), '.config', 'kitegeo', 'key');
const DASH = `${BASE}/en/dashboard (sign in → Use KiteGEO in Claude → Create a key)`;
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
  default:
    out({ ok: false, error: 'Commands: login <key> | me | prepare --site … | run --scan … | report --scan … [--wait] | plan --scan … [--wait] | track --scan … | rescan --project …' }, 1);
}
