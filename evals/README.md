# Foist evaluation guide

Foist's score is a writing-style estimate, not an authorship detector. The evaluation suite measures whether model and threshold changes make that estimate more useful without pretending unknown Slack messages have reliable ground-truth labels.

## Build a known-provenance dataset

Copy **dataset.example.jsonl** to the ignored file **dataset.local.jsonl**. Add only samples whose creation process is known and whose use has been approved.

Each JSONL record has:

- **id**: stable, non-identifying ID;
- **label**: human, ai, or mixed;
- **text**: the message, 40–12,000 characters;
- **provenance**: matching controlled_human, controlled_ai, or controlled_mixed;
- **consent_confirmed**: must be true for an enabled record;
- **category**: optional message type, such as project-update, sales, or support;
- **enabled**: disabled templates and quarantined examples are ignored;
- **notes**: optional provenance detail without personal data.

Do not label a real-world message as AI merely because a detector or reviewer thinks it sounds AI-like. That would train and evaluate the system against its own guesses. For AI cases, preserve the generating model and prompt in a separate access-controlled research log if useful; do not put sensitive data in this repository.

A useful first study has at least 200 enabled examples, balanced between controlled human and controlled AI writing and spread across short and long Slack-like categories. Keep mixed writing as a separately reported cohort. Deduplicate near-copies and split by author or prompt family so variations of the same source cannot land in both calibration and holdout sets.

## Run the configured model

The runner makes real API calls and refuses to begin unless cost is explicitly confirmed:

~~~bash
npm run eval -- --dataset evals/dataset.local.jsonl --runs 3 --confirm-api-cost
~~~

The runner evaluates the single `AI_PROVIDER` and its provider-specific model
variable in `.env` (for example, `GEMINI_MODEL`). To emit machine-readable
results, add `--json`:

~~~bash
npm run eval -- --dataset evals/dataset.local.jsonl --runs 3 --confirm-api-cost --json
~~~

The output reports precision, recall, false-positive rate, accuracy, Brier
score, calibration error, mean scores by label, score stability across repeats,
latency, failures, and an in-sample threshold suggestion. Failed calls remain
visible instead of being silently treated as predictions.

## Make a production decision

Choose the setup on a calibration split, then evaluate that frozen choice once on a held-out split. For Foist, false accusations are costlier than missed AI-ish messages, so prefer high precision and a low false-positive rate at the **YOU GOT FOISTED** threshold. Treat the runner's suggested threshold as a candidate, never as final evidence: it is optimized on the same data it reports.

Re-run the held-out evaluation when changing a provider, model snapshot, system
prompt, score rubric, or threshold. Also review errors by message category and
length; aggregate accuracy can hide systematic bias.
