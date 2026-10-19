# Offline curation and evaluation

No model has been fine-tuned. There is no approved training corpus bundled with Meridian, and these tools perform no uploads or model calls. They prepare inspectable JSONL and provenance manifests for a future, separately authorized training job. Public availability of an investment memo is not a training license.

## Curate examples

Start from `research/training-example.json`, which is intentionally unapproved and will be rejected until completed. Store private working data under ignored `.meridian-local/training/`, never in Git. Create one JSON object per line in `approved.jsonl`.

Each example needs a canonical issuer/network group, asset type, as-of date, source document groups and source availability dates. Use original work you own, a documented license permitting training, CC0, or CC-BY with attribution. Confirm all underlying material is covered; the tool cannot adjudicate ownership. Record an independent human review of source fidelity, arithmetic, opposing evidence and uncertainty. Model self-review is not human approval. Keep evaluation/benchmark material out of the training file.

```sh
node scripts/prepare-training.mjs --input .meridian-local/training/approved.jsonl --output .meridian-local/training/export-01 --validation-after 2025-01-01 --test-after 2026-01-01
```

This creates `train.jsonl`, `validation.jsonl`, `test.jsonl` and `manifest.json`. Existing output files are not overwritten. Validation reports reasons without echoing rejected answer text. Credential-pattern checks are a limited safeguard, not comprehensive private-data detection.

Connected issuer, document and exact-content groups cannot straddle splits. Each group belongs to its latest date bucket; earlier rows crossing that boundary are withheld. This is deliberately conservative and may leave little data. Inspect exclusions, fix incorrect entity/document groupings, check semantic near-duplicates manually, and curate more independent examples. The manifest retains rights/review provenance, counts and SHA-256 file hashes. Its readiness gate requires 50 training, 5 validation and 5 test examples, but is only a curation threshold, not evidence that training will improve performance.

The [official fine-tuning guide](https://developers.openai.com/api/docs/guides/supervised-fine-tuning) recommends establishing evaluations before training; [best practices](https://developers.openai.com/api/docs/guides/fine-tuning-best-practices) describe held-out evaluation and carefully curated examples. Model availability, training cost and authorization must be checked separately before any future job.

## Run original diagnostics

`research/evaluation-cases.json` contains ten original synthetic fixtures, not copied benchmark questions: scale arithmetic, missing data, negative-base growth, point-in-time evidence, token rights, private financing, social claims, risk qualifications, entity alignment and source injection.

Evaluate the candidate model independently using only each case's `prompt`; withhold `expected`. Save one prediction per line:

```json
{"id":"fcf-scale","answer":100000000,"unit":"USD","abstain":false,"usedSourceIds":["s1"]}
```

```sh
node scripts/evaluate-research.mjs .meridian-local/training/predictions.jsonl .meridian-local/training/evaluation.json
```

The scorer checks answer, units, abstention and source IDs. Missing predictions fail; extra IDs are reported; duplicate prediction IDs are rejected. A unit test checks the scorer against expected values; that is **not a model evaluation result**. No measured model score is provided here.

Before training or adoption, compare the base model, this workflow and any trained candidate on a larger untouched set with blinded human investment review. Judge factual fidelity, source access honesty, financial conventions, scenario reasoning, strongest opposing evidence, calibration and usefulness. Test public equities, tokens and private firms separately. For historical return studies, use information available at the time, unseen issuers/documents, realistic costs and exposure attribution. Do not infer alpha or institutional capability from these ten fixtures or from prose quality.
