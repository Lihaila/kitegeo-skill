---
name: kitegeo-pro
description: Run KiteGEO (lihaila.com/geo) from your AI agent. It checks whether AI assistants (ChatGPT and Grok; DeepSeek and Qwen for Chinese) recommend a brand when buyers ask, which competitors they name instead, how they describe it, and what to fix. It runs free checks, reads Full Reports and action plans the user has bought, and tracks brands weekly, all on the user's KiteGEO account through an API key. Use it whenever the user has a KiteGEO account or key, mentions KiteGEO Pro, or asks whether AI assistants recommend their brand, their AI visibility or share of voice, or for a GEO report, even if they don't say "KiteGEO".
---

# KiteGEO Pro

This skill runs the real KiteGEO on the user's account. KiteGEO asks the AI assistants real buyer questions and grades every answer: is the brand mentioned, in what position, recommended or not, with what sentiment, and which competitors appear instead. It turns that into a **GEO score out of 100**: 60% visibility, 20% reputation and 20% AI readiness.

Everything goes through `scripts/kitegeo.mjs` (Node 18+, no dependencies). It prints JSON, with progress on stderr. Run it as `node <skill-dir>/scripts/kitegeo.mjs <command>`.

## Accounts, plans and keys

- **Key:** the user signs in at lihaila.com/geo (Google or email) and creates a key under **Dashboard → Use KiteGEO in AI agents**.
- **Free check:** 5 questions × every assistant, from model memory. Limited to a few a day per person. It shows the score, the top 3 competitors and one sample question. The rest stays locked.
- **Full Report** (one-time, per brand; current price on lihaila.com/geo/en/pricing): 20 questions × every assistant, from memory **and** live web search. It includes every answer, all competitors and cited sources, plus an **action plan** with ready-to-paste llms.txt, JSON-LD, robots.txt, FAQ copy, an About paragraph, content briefs and corrections. It's bought on the report's web page.
- **Pro and Agency** (monthly, or a prepaid Pro pass): weekly tracking of 1 or 10 brands, with a full report every scan.
- **Payment always happens on the website through Stripe.** The skill never takes card details. When something needs buying, give the user the link from the script and stop.

## First use

Run `me`. If it exits with code 2, the JSON's `action` says what the user has to do:

| action | Tell the user |
|---|---|
| `create_key` | Sign in at lihaila.com/geo → Dashboard → **Use KiteGEO in AI agents** → **Create a key**, and paste it here. Then run `login <key>`, which saves it to `~/.config/kitegeo/key`, readable only by them. |
| `quota` | Today's free checks are used up. A Full Report or Pro has no daily limit (pricing link in the message). |
| `buy_report` | The action plan, the full answers and all competitors come with the Full Report. Buy it on the report page (link in the message). |
| `upgrade` | Weekly tracking needs the Pro or Agency plan (pricing link in the message). |

`me` also lists their reports (with scan ids) and tracked brands. Check it first: the user may already have a Full Report for this brand.

## Running a check

1. **Prepare.**
   ```bash
   node kitegeo.mjs prepare --site <url or brand> [--keywords "what they sell"]
   ```
   This takes about 20–40 s. It reads the site and returns the brand profile, likely competitors and proposed buyer questions. **Show the questions and competitors to the user**, and let them edit before running. Good questions are unbranded and phrased the way a buyer asks.
2. **Run.**
   ```bash
   node kitegeo.mjs run --scan <id> [--questions q.json] [--competitors "a,b,c"]
   ```
   `q.json` is a JSON array of questions, for when the user changed them.
3. **Report.**
   ```bash
   node kitegeo.mjs report --scan <id> --wait
   ```
   A free check takes about a minute.

**Present the report like this:**
- The GEO score, and the score for each assistant.
- Whether the brand is named, and how often (mention rate), plus share of voice against competitors.
- How the AIs describe the brand, and anything they get wrong.
- The AI-readiness checks that failed.
- One sample answer, quoted briefly.
- For a free check: say plainly what's locked and give the `reportUrl` to unlock it. **Don't invent the locked parts.**

## Full Reports and action plans

```bash
node kitegeo.mjs plan --scan <full report scan id> --wait
```

This only works on a Full Report. Present the plan's fixes as ready-to-paste files, saying where each one goes. If the user is in their site's repo, offer to apply them, showing each file before writing it.

## Weekly tracking (Pro / Agency)

- `track --scan <id>` adds the brand. Weekly scans then run automatically.
- `rescan --project <id>` runs a scan now. That's limited to once a day.
- To show trends, use `me`: the score history and the latest scan id are under `trackedBrands`.

## Rules

- **Report only what KiteGEO returned.** Answers from AI assistants change over time, so present them as "at the time of this check".
- **Don't start paid actions or repeated checks on your own.** Free checks are limited, so don't re-run one just to "try again" without asking.
- **When a check fails** (exit code 1), show the error and suggest trying again later.
