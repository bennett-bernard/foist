# Foist

Foist is a playful Slack detective for suspiciously polished messages. Forward or paste a message into Foist's DM—or run **Foist this message** from a message's More actions menu—and it returns:

- an **AI-ish writing estimate** with an explicit confidence level;
- the **likely prompt** behind the message;
- a short evidence board of writing signals; and
- for high-signal messages, a deliberately over-AI **Foist-back draft**.

Foist treats its score as entertainment plus writing-style analysis, not proof. Text alone cannot reliably establish who or what authored it.

## How the assessment works

Every eligible message receives a structured first pass from **gpt-5.6-terra** at medium reasoning. The rubric requires multiple interacting AI-associated style signals, actively looks for human counterevidence, and treats polish, grammar, corporate tone, em dashes, non-native phrasing, and accessibility-related patterns as weak evidence when they appear alone.

Foist asks **gpt-5.6-sol** for an independent second opinion when the first pass is low-confidence or scores inside the configurable review band (30–85% by default). The adjudicator critiques the first pass instead of averaging it. Its assessment becomes the final result. If that call fails, Foist safely returns the Terra result and marks the second look as unavailable.

This selective cascade spends the more capable model where judgment is ambiguous while keeping obvious cases faster and less expensive. The default medium reasoning effort follows an eval-first approach: raise or lower it only when representative measurements justify the tradeoff.

With the default 75% Foisted threshold:

| Estimate | Foist verdict | Foist-back offered? |
| --- | --- | --- |
| 0–19% | No foist detected | No |
| 20–49% | Slightly AI; off the hook this time | No |
| 50–74% | Foisty business | No |
| 75–100% | You got Foisted | Yes, by button or y/n |

The threshold is configurable. The draft is returned privately to the requester; Foist never sends it to the original sender automatically.

## Run it locally

Prerequisites:

- Node.js 22 or newer
- a Slack workspace where you can install apps
- an OpenAI API key

1. Go to [Slack's app dashboard](https://api.slack.com/apps), choose **Create New App → From an app manifest**, and paste [manifest.json](./manifest.json).
2. In **Basic Information → App-Level Tokens**, generate a token with connections:write. This is **SLACK_APP_TOKEN** (xapp-…).
3. Install the app from **OAuth & Permissions**. Copy its bot token as **SLACK_BOT_TOKEN** (xoxb-…).
4. Create the local environment file and fill in the real values:

   ~~~bash
   cp .env.example .env
   ~~~

5. Install and start Foist:

   ~~~bash
   npm install
   npm run dev
   ~~~

Open Foist's Messages tab and paste or forward a message. The manifest also installs the **Foist this message** shortcut.

Slack's [Bolt Socket Mode guide](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode) explains the app token and WebSocket connection. The bot subscribes only to message.im and asks for chat:write, im:history, and im:write.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| **SLACK_BOT_TOKEN** | Yes | — | Bot OAuth token |
| **SLACK_APP_TOKEN** | Yes | — | Socket Mode app token |
| **OPENAI_API_KEY** | Yes | — | Server-side model access |
| **OPENAI_PRIMARY_MODEL** | No | gpt-5.6-terra | First-pass assessment model |
| **OPENAI_ADJUDICATOR_MODEL** | No | gpt-5.6-sol | Independent second-pass model |
| **OPENAI_DRAFT_MODEL** | No | primary model | Foist-back drafting model |
| **FOIST_PRIMARY_REASONING** | No | medium | Primary reasoning effort |
| **FOIST_ADJUDICATOR_REASONING** | No | medium | Adjudicator reasoning effort |
| **FOIST_ADJUDICATION_ENABLED** | No | true | Enables selective second-pass review |
| **FOIST_ADJUDICATION_MIN_PERCENT** | No | 30 | Inclusive lower edge of review band |
| **FOIST_ADJUDICATION_MAX_PERCENT** | No | 85 | Inclusive upper edge of review band |
| **FOIST_FOISTED_THRESHOLD** | No | 75 | Strong verdict and Foist-back boundary, 60–95 |
| **FOIST_PENDING_TTL_MINUTES** | No | 60 | How long a Foist-back case remains available |
| **FOIST_DATA_PATH** | No | .data/pending.json | Single-process pending-case store |
| **FOIST_SAFETY_SALT** | Recommended | development value | Salt for privacy-preserving safety IDs |

**OPENAI_MODEL** remains supported as a legacy fallback for the primary model. Generate a long random **FOIST_SAFETY_SALT** outside local development.

## Privacy and reliability choices

- Submitted text is sent to the OpenAI Responses API with storage disabled.
- High-score messages are held locally only until drafted, dismissed, or expired. The pending file is created with owner-only permissions.
- Foist does not log message text.
- Forwarded content and first-pass results are treated as untrusted data, never as model instructions.
- Both passes use a strict JSON schema and application-side validation.
- A failed optional adjudication does not fail the whole analysis.
- Slack displays whether a second opinion completed or was unavailable.
- API calls have a 30-second timeout and two automatic retries.
- Inputs shorter than 40 characters are marked inconclusive; inputs over 12,000 characters are clearly reported as truncated.
- Each user can request eight analyses per minute in one process.
- Slack message timestamps are deduplicated for five minutes.
- Model output is escaped before Slack renders it, preventing surprise mentions.

The pending store and rate limiter are intentionally simple for a single worker. Before running multiple replicas, replace them with shared Redis/Postgres-backed state and a distributed limiter. For larger workspaces, move analyses to a queue while acknowledging Slack events immediately.

## Evaluate model and threshold changes

Use only consenting, known-provenance examples. The runner compares Terra and Sol at low and medium reasoning against the production cascade, supports repeated runs, and reports classification, calibration, stability, latency, and adjudication metrics.

~~~bash
cp evals/dataset.example.jsonl evals/dataset.local.jsonl
npm run eval -- --dataset evals/dataset.local.jsonl --runs 3 --confirm-api-cost
~~~

The command refuses to call the API without **--confirm-api-cost**. Dataset construction, holdout guidance, and metric interpretation are in [evals/README.md](./evals/README.md). The example records are disabled templates, not invented ground truth.

## Production container

~~~bash
docker build -t foist .
docker run --env-file .env -v foist-data:/app/.data foist
~~~

Deploy the image as a continuously running worker with outbound internet access. Socket Mode does not require a public inbound HTTP endpoint.

## Development

~~~bash
npm run check
npm test
npm run build
npm run eval -- --help
~~~

The unit suite uses fake model clients, so it does not require live Slack or OpenAI credentials.

## Project layout

- **src/app.ts** — Slack events, shortcut, buttons, rate limits, and orchestration
- **src/openai-engine.ts** — Terra/Sol routing, structured assessments, fallback, and drafting
- **src/evaluation.ts** — evaluation schema, metrics, calibration, and threshold suggestion
- **scripts/evaluate.ts** — cost-confirmed model comparison runner
- **evals/** — consent and holdout guidance plus disabled JSONL templates
- **src/extract-message.ts** — plain, rich-text, and forwarded-message extraction
- **src/presentation.ts** — playful Block Kit responses and configurable thresholds
- **src/pending-store.ts** — atomic, expiring single-worker case store
- **manifest.json** — importable Slack app configuration
