# Changelog

All notable changes to Foist will be documented here.

## Unreleased

- Clarified the Community edition's free, open-source, self-hosted release
  status and the potential cost of required third-party services.
- Added a static one-page project site for GitHub Pages with product, edition,
  and support information.

## 0.3.1 - 2026-08-22

- Enforced pending-message TTLs on disk with scheduled cleanup, startup/access
  purges, and retry handling for failed cleanup writes.
- Added the documented OpenAI-compatible provider variables to `.env.example`.

## 0.3.0 - 2026-08-22

- Added explicit OpenAI, Anthropic, Grok, and Gemini configuration blocks.
- Added a native Google Gemini adapter using structured Interactions output.
- Renamed the public xAI provider option to Grok while retaining legacy aliases.
- Kept a separate OpenAI-compatible option for other Responses-compatible services.
- Added configurable Grok reasoning effort with a latency-friendly `low` default.
- Prevented truncated Gemini Foist-back drafts with a larger draft budget, low thinking, and incomplete-response detection.

## 0.2.0 - 2026-08-22

- Replaced the Terra-to-Sol cascade with one configured provider and model.
- Added Anthropic, xAI/Grok, and Responses-compatible provider support.

## 0.1.0 - 2026-08-22

- Added LOW, MEDIUM, and HIGH stoplight assessments.
- Added selective Terra-to-Sol adjudication and repeatable evaluation tooling.
- Limited prompt inference, reaction GIFs, and Foist-back drafting to HIGH readings.
- Added Slack DM and message-shortcut workflows.
- Added Docker and Docker Compose self-hosting paths.
- Added separate self-hosted Socket Mode and hosted HTTP runtime entry points.
