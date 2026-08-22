# Foist

[![CI](https://github.com/bennett-bernard/foist/actions/workflows/ci.yml/badge.svg)](https://github.com/bennett-bernard/foist/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Foist is a playful Slack detective for suspiciously polished messages. Forward
or paste a message into Foist's DM—or run **Foist this message** from a
message's More actions menu—and it returns:

- an **AI-ish writing level**—LOW, MEDIUM, or HIGH;
- a short evidence board of writing signals;
- for HIGH readings, the **likely prompt** behind the message and a reaction GIF; and
- for HIGH readings, a deliberately over-AI **Foist-back draft**.

Foist treats every reading as entertainment plus writing-style analysis, not
proof. Text alone cannot reliably establish who or what authored it.

## Choose your edition

| Edition | Slack connection | Credentials and hosting | Status |
| --- | --- | --- | --- |
| **Community self-hosted** | Socket Mode | You provide a Slack app, an OpenAI key, and a machine | Ready |
| **Hosted foundation** | HTTP Events API | Single-workspace development only | Not yet a public multi-workspace service |

The Community edition is MIT licensed, requires no Foist account, and has no
central Foist service. The hosted entry point shares the same assessment core
but still needs OAuth, shared storage, billing, and production operations before
it can become a paid Slack Marketplace app.

## How the assessment works

Every eligible message receives a structured first pass from
**gpt-5.6-terra** at medium reasoning. The rubric weighs interacting
AI-associated style signals against human counterevidence. Individual habits
such as polish, grammar, corporate tone, em dashes, non-native phrasing, or
accessibility-related patterns are not proof.

Foist asks **gpt-5.6-sol** for an independent second opinion when the first pass
is low-confidence or scores inside the configurable review band—30–85% by
default. The adjudicator critiques the first pass instead of averaging it. If
that optional call fails, Foist returns the validated Terra result.

Slack displays a reading rather than a percentage:

| Reading | Interpretation | Prompt and Foist-back? |
| --- | --- | --- |
| 🟢 ⚫ ⚫ LOW | Few or isolated AI-style signals | No |
| ⚫ 🟡 ⚫ MEDIUM | A meaningful cluster of AI-style signals | No |
| ⚫ ⚫ 🔴 HIGH | Strong, interacting AI-style signals | Yes |

Foist keeps a numeric score internally for routing and evaluation. LOW is below
35, MEDIUM is 35–64, and HIGH begins at 65 by default. The draft is returned
privately to the requester; Foist never sends it to the original sender.

## Self-host with Node.js

Prerequisites:

- Node.js 22 or newer
- a Slack workspace where you can install apps
- an OpenAI API key

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
| **SLACK_APP_TOKEN** | Self-hosted | — | Socket Mode app token |
| **SLACK_SIGNING_SECRET** | Hosted HTTP | — | Verifies Slack HTTP requests |
| **PORT** | Hosted HTTP | 3000 | HTTP listener port |
| **OPENAI_API_KEY** | Yes | — | Server-side model access |
| **OPENAI_PRIMARY_MODEL** | No | gpt-5.6-terra | First-pass model |
| **OPENAI_ADJUDICATOR_MODEL** | No | gpt-5.6-sol | Second-pass model |
| **OPENAI_DRAFT_MODEL** | No | primary model | Foist-back model |
| **FOIST_PRIMARY_REASONING** | No | medium | Primary reasoning effort |
| **FOIST_ADJUDICATOR_REASONING** | No | medium | Adjudicator reasoning effort |
| **FOIST_ADJUDICATION_ENABLED** | No | true | Enables selective review |
| **FOIST_ADJUDICATION_MIN_PERCENT** | No | 30 | Review-band lower edge |
| **FOIST_ADJUDICATION_MAX_PERCENT** | No | 85 | Review-band upper edge |
| **FOIST_FOISTED_THRESHOLD** | No | 65 | HIGH and Foist-back boundary |
| **FOIST_PENDING_TTL_MINUTES** | No | 60 | Pending draft lifetime |
| **FOIST_DATA_PATH** | No | .data/pending.json | Single-process pending store |
| **FOIST_SAFETY_SALT** | Recommended | development value | Privacy-preserving safety IDs |

`OPENAI_MODEL` remains supported as a legacy fallback for the primary model.
Generate a long random **FOIST_SAFETY_SALT** outside local development.

## Privacy and reliability

- Submitted text is sent to the OpenAI Responses API with storage disabled.
- HIGH messages are held locally only until drafted, dismissed, or expired.
- The pending file is created with owner-only permissions.
- Foist does not log message text.
- Forwarded content and first-pass results are treated as untrusted data.
- Model responses use strict JSON schemas plus application-side validation.
- API calls have a 30-second timeout and two automatic retries.
- Inputs shorter than 40 characters are marked inconclusive.
- Inputs over 12,000 characters are clearly reported as truncated.
- Each user can request eight analyses per minute in one process.
- Slack message timestamps are deduplicated for five minutes.
- Model output is escaped before Slack rendering to prevent surprise mentions.

The included pending store and limiter are intended for one worker. Multiple
replicas require shared Redis/Postgres-backed state and a distributed limiter.

## Hosted HTTP development foundation

This path exists so the assessment core does not need to be forked when Foist
becomes a hosted product. It is currently for a single development workspace,
not public installation or paid use.

1. Replace `foist.example.com` in
   [manifest.hosted.json](./manifest.hosted.json) with an HTTPS hostname that
   routes `/slack/events` to this process.
2. Import that manifest into a separate Slack development app and install it.
3. Copy the hosted environment template and fill in its values:

   ```bash
   cp .env.hosted.example .env
   ```

4. Start the HTTP receiver:

   ```bash
   npm run dev:hosted
   ```

Before public distribution this mode still needs Slack OAuth, an encrypted
database-backed installation store, shared pending/rate-limit state, billing,
metering, onboarding, and a deletion/uninstall flow.

## Evaluate model or threshold changes

Use only consenting, known-provenance examples. The runner compares Terra and
Sol at low and medium reasoning against the production cascade and reports
classification, calibration, stability, latency, and adjudication metrics.

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

The unit suite uses fake model clients and needs no live Slack or OpenAI
credentials. Pull requests should follow [CONTRIBUTING.md](./CONTRIBUTING.md)
and the project [code of conduct](./CODE_OF_CONDUCT.md). Security reports belong
in the private process described by [SECURITY.md](./SECURITY.md).

## Project layout

- **src/app.ts** — Slack workflows, rate limits, and orchestration
- **src/bootstrap.ts** — shared assessment-engine and handler bootstrap
- **src/self-hosted.ts** — Community Socket Mode entry point
- **src/hosted.ts** — single-workspace HTTP development entry point
- **src/openai-engine.ts** — model routing, assessment, fallback, and drafting
- **src/evaluation.ts** — evaluation schema and metrics
- **scripts/evaluate.ts** — cost-confirmed evaluation runner
- **src/presentation.ts** — Block Kit responses and thresholds
- **src/pending-store.ts** — atomic, expiring single-worker store
- **manifest.json** — Community Socket Mode manifest
- **manifest.hosted.json** — HTTP development manifest
- **compose.yaml** — hardened self-hosted container service

## License and support

Foist is available under the [MIT License](./LICENSE). Fork it, remix the jokes,
or make the detective stranger. If it made you laugh, you can
[buy Bennett a coffee](https://buymeacoffee.com/bennettbernard).

See [SUPPORT.md](./SUPPORT.md) for help and [CHANGELOG.md](./CHANGELOG.md) for
release notes.
