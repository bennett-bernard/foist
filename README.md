# Foist

[![CI](https://github.com/bennett-bernard/foist/actions/workflows/ci.yml/badge.svg)](https://github.com/bennett-bernard/foist/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Latest release](https://img.shields.io/github/v/release/bennett-bernard/foist)](https://github.com/bennett-bernard/foist/releases/latest)

Foist is a free, open-source, self-hosted Slack detective for suspiciously
polished messages. Forward or paste a message into Foist's DM—or run **Foist
this message** from a message's More actions menu—and it returns:

- an **AI-ish writing level**—LOW, MEDIUM, or HIGH;
- a short evidence board of writing signals;
- for HIGH readings, the **likely prompt** behind the message and a reaction GIF; and
- for HIGH readings, a deliberately over-AI **Foist-back draft**.

Foist treats every reading as entertainment plus writing-style analysis, not
proof. Text alone cannot reliably establish who or what authored it.

## Free and open source

Foist is released under the [MIT License](./LICENSE). You may use, copy,
modify, and redistribute the software without paying Foist. It requires no
Foist account, subscription, license key, or central Foist service.

Foist is self-hosted: you operate it and provide a Slack workspace, a machine
running Node.js or Docker, and a supported model-provider API key. Slack, model
providers, and hosting companies may impose their own limits or charges. “Free”
describes the Foist software and license; it does not make those third-party
services free. There is no hosted service or paid edition planned—Foist is a
small open-source project for people who want to run the joke themselves.

## How the assessment works

Every eligible message gets one structured assessment from the provider and
model selected in `.env`. Foist-back uses that same model, but only after someone
explicitly requests a draft; there is no second model or review pass.

The rubric weighs interacting AI-associated style signals against human
counterevidence. Individual habits such as polish, grammar, corporate tone, em
dashes, non-native phrasing, or accessibility-related patterns are not proof.

Slack displays a reading rather than a percentage:

| Reading | Interpretation | Prompt and Foist-back? |
| --- | --- | --- |
| 🟢 ⚫ ⚫ LOW | Few or isolated AI-style signals | No |
| ⚫ 🟡 ⚫ MEDIUM | A meaningful cluster of AI-style signals | No |
| ⚫ ⚫ 🔴 HIGH | Strong, interacting AI-style signals | Yes |

Foist keeps a numeric score internally for levels and evaluation. LOW is below
35, MEDIUM is 35–64, and HIGH begins at 65 by default. The draft is returned
privately to the requester; Foist never sends it to the original sender.

## Self-host with Node.js

Prerequisites:

- Node.js 22 or newer
- a Slack workspace where you can install apps
- an API key from OpenAI, Anthropic, xAI (Grok), Google (Gemini), or a
  compatible provider

1. Go to [Slack's app dashboard](https://api.slack.com/apps), choose
   **Create New App → From an app manifest**, and paste
   [manifest.json](./manifest.json).
2. In **Basic Information → App-Level Tokens**, generate a token with
   `connections:write`. This becomes **SLACK_APP_TOKEN** (`xapp-…`).
3. Install the app from **OAuth & Permissions** and copy its bot token as
   **SLACK_BOT_TOKEN** (`xoxb-…`).
4. Create your environment file and replace every placeholder:

   ```bash
   cp .env.example .env
   ```

5. Install and start Foist:

   ```bash
   npm ci
   npm run dev
   ```

Open Foist's Messages tab and paste or forward a message. The manifest also
installs the **Foist this message** shortcut.

## Self-host with Docker Compose

After creating `.env` as described above:

```bash
docker compose up --detach --build
docker compose logs --follow foist
```

To rebuild after updating the code:

```bash
docker compose up --detach --build
```

To stop Foist without deleting its pending-data volume:

```bash
docker compose down
```

The container runs as a non-root user with a read-only filesystem. Only the
named `foist-data` volume is writable. Socket Mode needs outbound internet
access but no public inbound port.

A direct Docker invocation is also supported:

```bash
docker build -t foist .
docker run --env-file .env -v foist-data:/app/.data foist
```

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| **SLACK_BOT_TOKEN** | Yes | — | Bot OAuth token |
| **SLACK_APP_TOKEN** | Yes | — | Socket Mode app token |
| **AI_PROVIDER** | No | openai | `openai`, `anthropic`, `grok`, `gemini`, or `openai-compatible` |
| **OPENAI_API_KEY** | OpenAI | — | OpenAI key |
| **OPENAI_MODEL** | OpenAI | gpt-5.6-terra | OpenAI model used by Foist |
| **ANTHROPIC_API_KEY** | Anthropic | — | Anthropic key |
| **ANTHROPIC_MODEL** | Anthropic | — | Claude model used by Foist |
| **GROK_API_KEY** | Grok | — | xAI key |
| **GROK_MODEL** | Grok | — | Grok model used by Foist |
| **GROK_REASONING_EFFORT** | Grok | low | `low`, `medium`, `high`, or `xhigh` |
| **GEMINI_API_KEY** | Gemini | — | Google Gemini key |
| **GEMINI_MODEL** | Gemini | — | Gemini model used by Foist |
| **COMPATIBLE_API_KEY** | Compatible | — | Key for another Responses-compatible service |
| **COMPATIBLE_MODEL** | Compatible | — | Model exposed by that service |
| **COMPATIBLE_BASE_URL** | Compatible | — | Responses API base URL |
| **FOIST_FOISTED_THRESHOLD** | No | 65 | HIGH and Foist-back boundary |
| **FOIST_PENDING_TTL_MINUTES** | No | 60 | Pending draft lifetime |
| **FOIST_DATA_PATH** | No | .data/pending.json | Single-process pending store |
| **FOIST_SAFETY_SALT** | Recommended | development value | Privacy-preserving safety IDs |

Provider behavior:

| Provider | API used | Extra setup |
| --- | --- | --- |
| **openai** | OpenAI Responses | None |
| **anthropic** | Anthropic Messages | Set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` |
| **grok** | xAI Responses | Set `GROK_API_KEY` and `GROK_MODEL`; reasoning defaults to `low` |
| **gemini** | Google Gemini Interactions | Set `GEMINI_API_KEY` and `GEMINI_MODEL` |
| **openai-compatible** | Responses-compatible endpoint | Set all three `COMPATIBLE_*` variables; JSON-schema output must be supported |

For upgrades, `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` remain supported as
generic fallbacks. `AI_PROVIDER=xai`, `XAI_API_KEY`, `XAI_MODEL`, and
`OPENAI_PRIMARY_MODEL` also remain supported. New installations should use the
explicit provider variables shown in `.env.example`. Generate a long random
**FOIST_SAFETY_SALT** outside local development.

## Privacy and reliability

- Submitted text is sent only to the configured model provider. Foist requests
  no response storage where the provider API supports that option.
- HIGH messages are removed from Foist's active data file when drafted,
  dismissed, or expired. An in-process timer enforces the configured TTL, with
  defensive cleanup on startup and access; filesystem snapshots and backups
  remain the operator's responsibility.
- The pending file is created with owner-only permissions.
- Foist does not log message text.
- Forwarded content is treated as untrusted data and never followed as instructions.
- Model responses use strict JSON schemas plus application-side validation.
- Grok gets a three-minute timeout and one retry for reasoning latency; other
  providers get a 30-second timeout and two retries.
- Inputs shorter than 40 characters are marked inconclusive.
- Inputs over 12,000 characters are clearly reported as truncated.
- Each user can request eight analyses per minute in one process.
- Slack message timestamps are deduplicated for five minutes.
- Model output is escaped before Slack rendering to prevent surprise mentions.

The included pending store and limiter are intended for one worker. Multiple
replicas require shared Redis/Postgres-backed state and a distributed limiter.

## Evaluate model or threshold changes

Use only consenting, known-provenance examples. The runner tests the exact
`AI_PROVIDER` and provider-specific model configured in `.env`, reporting classification,
calibration, stability, latency, failures, and a candidate threshold.

```bash
cp evals/dataset.example.jsonl evals/dataset.local.jsonl
npm run eval -- --dataset evals/dataset.local.jsonl --runs 3 --confirm-api-cost
```

The command refuses to call the API without `--confirm-api-cost`. See
[evals/README.md](./evals/README.md) for dataset and holdout guidance.

## Development

```bash
npm run check
npm test
npm run build
npm run eval -- --help
```

The unit suite uses fake model clients and needs no live Slack or model-provider
credentials. Pull requests should follow [CONTRIBUTING.md](./CONTRIBUTING.md)
and the project [code of conduct](./CODE_OF_CONDUCT.md). Security reports belong
in the private process described by [SECURITY.md](./SECURITY.md).

## Project layout

- **src/app.ts** — Slack workflows, rate limits, and orchestration
- **src/bootstrap.ts** — shared assessment-engine and handler bootstrap
- **src/self-hosted.ts** — Socket Mode entry point
- **src/foist-engine.ts** — provider-neutral assessment and drafting
- **src/model-provider.ts** — model-provider interface
- **src/providers/** — native OpenAI, Anthropic, Grok, Gemini, and compatible adapters
- **src/evaluation.ts** — evaluation schema and metrics
- **scripts/evaluate.ts** — cost-confirmed evaluation runner
- **src/presentation.ts** — Block Kit responses and thresholds
- **src/pending-store.ts** — atomic, expiring single-worker store
- **manifest.json** — Socket Mode Slack app manifest
- **compose.yaml** — hardened self-hosted container service

## License and support

Foist is available under the [MIT License](./LICENSE). Fork it, remix the jokes,
or make the detective stranger. If it made you laugh, you can
[buy Bennett a coffee](https://buymeacoffee.com/bennettbernard).

See [SUPPORT.md](./SUPPORT.md) for help and [CHANGELOG.md](./CHANGELOG.md) for
release notes.
