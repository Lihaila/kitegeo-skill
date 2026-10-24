# KiteGEO skills for Claude

**Does ChatGPT recommend your brand?** More buyers now ask an AI assistant ("what's the best X for Y?") instead of searching Google. Being named inside the answer is the new page one. That's GEO: generative engine optimization.

Two skills, from the makers of [KiteGEO](https://lihaila.com/geo/):

| | **kitegeo** | **kitegeo-pro** |
|---|---|---|
| AI-readiness audit (can AI crawlers read your site?) | ✓ 11 checks, scored out of 100 | ✓ part of every report |
| Ready-to-paste fixes: robots.txt, llms.txt, JSON-LD, FAQ, meta | ✓ written by Claude from your page | ✓ in the Full Report's action plan |
| What ChatGPT, Gemini, Perplexity, Claude and Grok actually say about you | – | ✓ graded answers, mention rate, share of voice |
| Competitors the AIs name instead, sources they cite | – | ✓ |
| Weekly tracking | – | ✓ Pro and Agency plans |
| Cost | Free, runs on your machine | Free to install; uses your KiteGEO account (free checks, then a Full Report or plan) |
| Needs | Nothing | A KiteGEO account and API key |

## kitegeo (free)

Give it your website. It runs the same 11-point AI-readiness audit as KiteGEO:
- AI crawlers allowed in robots.txt (GPTBot, ClaudeBot, PerplexityBot, Google-Extended and more)
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

Then Claude writes the fixes, using only facts from your site. The bundled script checks that the robots.txt no longer blocks AI crawlers and that the JSON-LD is valid. The script talks only to your site.

## kitegeo-pro (your KiteGEO account)

Runs the real KiteGEO from Claude. It asks every assistant real buyer questions, grades every answer, and gives you a GEO score with per-assistant results, the competitors named instead, and how the AIs describe you.

1. Sign in at [lihaila.com/geo](https://lihaila.com/geo/) (Google or email).
2. Open **Dashboard → Use KiteGEO in Claude → Create a key**.
3. Install the skill (below) and paste the key when Claude asks. It's saved to `~/.config/kitegeo/key`, readable only by you.

**What it can do:**
- **Free checks:** 5 questions × every assistant, a few per day.
- **Full Report** ($29 one-time, bought on the report's web page): 20 questions, memory and live search, every answer, all competitors, cited sources and an action plan with ready-to-paste fixes. The skill can fetch and apply that plan.
- **Pro and Agency:** weekly tracking with a score trend.

Payment always happens on the website through Stripe. Built for Claude Code; the claude.ai sandbox may block calls to outside servers.

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
