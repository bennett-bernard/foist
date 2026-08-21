# Contributing to Foist

Foist is a small, playful community project. Bug fixes, sharper calibration,
friendlier installation paths, and new jokes are welcome.

## Development setup

1. Fork and clone the repository.
2. Install Node.js 22 or newer.
3. Run **npm ci**.
4. Copy **.env.example** to **.env** only if you need to test a real Slack app.
5. Before opening a pull request, run:

   ~~~bash
   npm run check
   npm test
   npm run build
   ~~~

The unit suite does not require Slack or OpenAI credentials.

## Good contributions

- Fix bugs without expanding Slack permissions.
- Improve accessibility, onboarding, or deployment documentation.
- Add playful verdicts that remain kind rather than accusatory.
- Improve evaluation metrics or model routing with tests.
- Add integrations that preserve private, user-initiated behavior.

For calibration work, use consenting, known-provenance samples and follow
**evals/README.md**. Never commit real private Slack messages, **.env** files,
API keys, or **evals/dataset.local.jsonl**.

## Pull requests

Keep changes focused, explain the user-facing effect, and include tests when
behavior changes. By submitting a contribution, you agree that it may be
distributed under the MIT License.
