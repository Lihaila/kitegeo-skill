# KiteGEO skills for AI agents

**Does ChatGPT recommend your brand?** More buyers now ask an AI assistant ("what's the best X for Y?") instead of searching Google. Being named inside the answer is the new page one. That's GEO: generative engine optimization.

Two skills for Claude Code, Codex, Cursor, Gemini CLI or any agent that supports SKILL.md skills, from the makers of [KiteGEO](https://lihaila.com/geo/):

| | **kitegeo** | **kitegeo-pro** |
|---|---|---|
| AI-readiness audit (can AI crawlers read your site?) | ✓ 11 checks, scored out of 100 | ✓ part of every report |
| Ready-to-paste fixes: robots.txt, llms.txt, JSON-LD, FAQ, meta | ✓ written by your agent from your page | ✓ in the Full Report's action plan |
| What AI assistants actually say about you (ChatGPT and Grok; DeepSeek and Qwen for Chinese) | – | ✓ graded answers, mention rate, share of voice |
| Competitors the AIs name instead, sources they cite | – | ✓ |
| Weekly tracking | – | ✓ Pro and Agency plans |
| Cost | Free, runs on your machine | Free to install; uses your KiteGEO account (free checks, then a Full Report or plan) |
| Needs | Nothing | A KiteGEO account and API key |

## kitegeo (free)

Give it your website. It runs the same 11-point AI-readiness audit as KiteGEO:
- AI search crawlers allowed in robots.txt (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot). Blocking training-only crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) is reported as an opt-out and costs no points
- Text readable without JavaScript
- schema.org structured data
- llms.txt
- Title and description
- One clear H1
- Question-and-answer content
- Sitemap
- About page
- HTTPS
- Response speed

Then your agent writes the fixes, using only facts from your site. Before it suggests any change to your crawler rules, your agent asks you first, and it keeps any training opt-outs you already have. The bundled script checks that the robots.txt no longer blocks AI search crawlers and that the JSON-LD is valid. The script talks only to your site.

## kitegeo-pro (your KiteGEO account)

Runs the real KiteGEO from your agent. It asks every assistant real buyer questions, grades every answer, and gives you a GEO score with per-assistant results, the competitors named instead, and how the AIs describe you.

1. Sign in at [lihaila.com/geo](https://lihaila.com/geo/) (Google or email).
2. Open **Dashboard → Use KiteGEO in AI agents → Create a key**.
3. Install the skill (below) and paste the key when your agent asks. It's saved to `~/.config/kitegeo/key`, readable only by you.

**What it can do:**
- **Free checks:** 5 questions × every assistant, a few per day.
- **Full Report** (one-time, bought on the report's web page; see [pricing](https://lihaila.com/geo/en/pricing)): 20 questions, memory and live search, every answer, all competitors, cited sources and an action plan with ready-to-paste fixes. The skill can fetch and apply that plan.
- **Pro and Agency:** weekly tracking with a score trend.

Payment always happens on the website through Stripe. It needs an agent with network access; the claude.ai sandbox may block calls to outside servers.

## Install

**Claude Code**

```
/plugin marketplace add Lihaila/kitegeo-skill
/plugin install kitegeo@kitegeo
```

This installs both skills. Or copy one in by hand:

```bash
git clone https://github.com/Lihaila/kitegeo-skill
cp -r kitegeo-skill/skills/kitegeo ~/.claude/skills/        # free audit
cp -r kitegeo-skill/skills/kitegeo-pro ~/.claude/skills/    # KiteGEO account
```

**Updating in Claude Code:** plugins don't update on their own. To get the latest version:

```
/plugin marketplace update kitegeo
/plugin update kitegeo@kitegeo
```

Then restart Claude Code.

**Any other agent that supports SKILL.md skills** (Codex, Cursor, Gemini CLI and others): copy the skill folder from `skills/` into that agent's skills directory (see its docs for the location). The scripts are plain Node with no dependencies, so nothing else is needed. We built and tested these with Claude Code.

**claude.ai**

Download `kitegeo.zip` from the [latest release](https://github.com/Lihaila/kitegeo-skill/releases/latest). Then open **Settings → Capabilities**, turn on code execution, and upload it under **Skills**.

Both skills need Node 18 or later for their scripts.

## Try it

```
is example.com ready for AI search? fix what's wrong
write an llms.txt and organization schema for my site
does ChatGPT recommend us when people ask for the best project management tool for agencies?   # kitegeo-pro
```

## License

MIT
