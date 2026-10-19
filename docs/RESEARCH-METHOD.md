# Research method and its limits

Meridian applies research-informed workflow design. It has **not** fine-tuned model weights, demonstrated hedge-fund-equivalent diligence, or established investment alpha. Current models use the connected ChatGPT plan. No API credits or automatic paid fallback are required for this workflow; plan limits still apply.

## One investigation, one delivered report

After identifying the exact investment, a planning pass chooses 6–16 substantive sections and an executive synthesis. Titles and mandates adapt to the investment. Coverage validation requires business economics, financial quality, competition, governance, qualitative evidence, valuation, risks, opposing evidence and monitoring. These are research obligations, not fixed report headings. The synthesis is generated last and displayed first. Length targets are 12,000–19,000 words for deep work and 23,000–35,000 for exhaustive work; available evidence and model output limits may reduce length.

Each section follows this sequence:

1. **Evidence:** a structured ledger separates reported facts, issuer assertions, inference, assumptions and gaps. It records original links, dates, authors, access limits, qualifiers, opposing evidence and the effect on investment judgment. Prompts request relevant YouTube and public social sources without pretending to access unavailable transcripts or posts.
2. **Arithmetic and provenance:** code recalculates supported addition, subtraction, ratios, margins and growth from explicitly labeled inputs. It checks scale, entity, period, units, currency, missing values, future evidence and invalid denominators. This verifies arithmetic from supplied inputs, not the truth or completeness of those inputs.
3. **Analysis:** a writing pass receives the ledger, deterministic results, flags and bounded excerpts from every preceding section. Writing/revision stages do not issue extra web searches; evidence collection and skeptical review handle retrieval, and material review findings trigger an updated ledger. When the budget is tight, both the beginning and end of each section are retained so late opposing evidence is not systematically dropped. Omission is labeled.
4. **Skeptical review:** a fresh conversation receives the draft and ledger, with instructions to independently search material sources, check adverse evidence and assess decision sensitivity. Source checks are model-reported, not an external audit. A pass verdict cannot erase deterministic flags.
5. **Revision:** material review findings trigger up to three targeted revisions with fresh rechecks. Unresolved issues remain marked for further review; there is no numeric self-awarded quality score or infinite self-improvement loop.
6. **Delivery:** drafts save after each completed section but stay out of the report reader and exports until the entire report is complete. One consolidated document includes source links and the evidence-review limitations. Follow-up chat then becomes available.

All automated stages use isolated conversation IDs and explicit context budgets. This prevents the reviewer from simply inheriting the writer's conversation. It does not make reviewers independent humans or eliminate correlated model errors. Existing completed research is preserved on resume and is not retroactively described as reviewed. Failures stop at the current section with saved progress intact. An interrupted or unsaved structured stage may need to be rerun. Keep the report open; this is browser-driven orchestration, not a durable background worker.

A malformed completed ledger/review receives one automatic structure-repair attempt, preserving evidence rather than inventing values to fit the schema. Oversized or still-invalid responses stop safely. Cash-flow additions support up to 40 line items. An explicit `rollForward` operation reconciles an earlier opening balance with signed changes for a later closing period; ordinary additions still reject mixed dates. This prevents a legitimate cash bridge from being confused with an incompatible-period calculation.

## Public research informing the implementation

These papers motivate specific safeguards; Meridian does not reproduce their models or claim their benchmark results. Recent preprints should be treated as provisional.

| Primary source | Applied principle |
| --- | --- |
| [FinFIRST, September 2026](https://arxiv.org/abs/2609.25192) | Separate evidence acquisition from answer quality; make temporal, entity, unit and source-authority failures inspectable. |
| [ICBCBench, June 2026](https://arxiv.org/abs/2606.17458) | Combine objective checks with qualitative review; readable prose alone is insufficient evidence of financial reliability. |
| [Reading Is Not Using, August 2026](https://arxiv.org/abs/2608.24842) | Preserve how retrieved evidence affects the investment decision, especially adverse information. This is preliminary evidence, not an established guarantee. |
| [When Summaries Distort Decisions, June 2026](https://arxiv.org/abs/2606.29251) | Carry original qualifications into the decision context instead of compressing away their implications. |
| [FinanceQA, January 2025](https://arxiv.org/abs/2501.18062) | Recompute financial arithmetic and preserve conventions and missing-data constraints. |
| [KTD-Fin, May 2026](https://arxiv.org/abs/2605.28359) | Use temporal and issuer/source isolation; do not confuse memorization, market exposure or a plausible narrative with investment skill. |

## Financial reasoning checks

The engine can request four typed model families in its evidence ledger. Code calculates their outputs before drafting, supplies them to the skeptical reviewer, and recomputes them again when saved:

- **Industrial-company FCFF:** annual operating profit, cash taxes, depreciation, capex and noncash working-capital investment; year-end present values; terminal reinvestment = growth / ROIC; enterprise-to-common-equity claims; independently declared money/share scales and diluted shares. Operating losses do not automatically create tax refunds. The generic model does not support bank/insurance capital models, explicit NOL schedules or complex capital structures.
- **Token economics:** circulating market capitalization, fully diluted value, circulating ownership dilution, inflation-adjusted staking quantity and fee capture. It refuses unsupported holder distributions and distinguishes supply unlocks from inflation. These quantities do not establish a USD return or token price target.
- **Private-company waterfall:** one nonparticipating preferred class choosing preference or conversion, capped by available exit equity proceeds. Other structures are explicitly unsupported; participation, multiple classes, seniority, option refreshes and uncertain rights cannot be silently simplified.
- **Reverse steady-state valuation:** revenue and operating-profit hurdles implied by EV, growth, ROIC, margin, taxes and discount rate. It includes reinvestment and does not claim a multistage forecast or a probability.

The FCFF conventions draw on Damodaran's primary teaching material on [cash flows](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/littlebook/cashflows.htm), [terminal reinvestment](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/termvalueexreturns.htm), and [matching cash flows with discount rates](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/val.html). The implementation is deliberately narrower than a professional financial model and blocks unsupported inputs.

The reviewer examines causal operating drivers, financial-statement reconciliation, economic costs of compensation, base-rate support, downside funding, correlated sources and falsification conditions. Material evidence problems trigger a targeted source-ledger refresh and recalculation before revision. The loop stops when checks pass, the same material critique repeats, or three revision rounds finish. Remaining issues accompany the report; an additional round is not itself evidence of better investment judgment.

## Measured evaluation, October 19, 2026

Using the connected ChatGPT plan and the same `gpt-6.1-sol` model, the baseline and candidate each passed **12/12 development cases and 5/5 held-out cases**. No API-key fallback was used. The candidate received the reasoning protocol and deterministic outputs for applicable supplied models; the baseline received the case questions alone within the existing Meridian assistant context. Expected answers were withheld from both. Results and predictions are in `research/evaluations/2026-10-19/`.

This experiment shows **no measured accuracy gain on these cases**. Both reached the suite ceiling. It supports regression checking on specified mechanics, not a claim of improved general reasoning, superior investment returns, or complete end-to-end diligence quality. Inputs were supplied synthetically; the comparison does not test real-world extraction quality. Each arm ran once, with no stochastic confidence interval. More diverse untouched cases and blinded human review are needed before making a quality claim. The additional safeguards improve inspectability and enforce supported mechanics, while their broader effect remains unmeasured.

To reproduce intentionally using your plan allowance, run `npm test` to compile the local validation modules, then `node scripts/evaluate-connected-reasoning.mjs baseline development .meridian-local/evals/baseline-01` and repeat with `candidate` or `holdout`. This command makes real subscription-model calls; it is not part of `npm test` or CI. Use a new output directory for each run. It never trains weights or selects a paid API-key fallback.

### Live financial-section check

A separate Microsoft FY2025 financial-section check used the connected model with an August 15, 2025 cutoff. It exposed two implementation defects: an eight-input limit rejected a full cash-flow reconciliation, and ordinary period checks rejected an opening-to-closing cash bridge. The engine now supports 40 inputs and a distinct dated roll-forward operation; regression tests cover both. The supplied statement inputs recompute operating cash flow of $136.162 billion and cash FCF of $71.611 billion. The [original annual report](https://www.microsoft.com/investor/reports/ar25/) supports those historical amounts, but today's annual-report web package alone does not establish exactly what was accessible on the historical cutoff date.

The live run completed an initial analysis, skeptical review, refreshed evidence, revised analysis and second review. It surfaced omitted lease commitments, tax exposure, asset-life comparisons and margin pressure. The second review still found unresolved decision thresholds, cash-return definitions and historical source availability. A subsequent evidence response was interrupted by the provider and was correctly rejected rather than saved as a completed report. **The full live pipeline did not complete this check.** This is an engineering finding, not a measured investment-quality gain; the raw material is neither training data nor a published diligence report.

The latest prompts request a bounded retrieval budget (evidence: six searches/eight original-document opens; review: four searches/six opens) and explicit unresolved gaps. These are model instructions, not tool-level enforced counters, and were added after the interrupted run. The production writing/revision stages also disable additional web retrieval. The interrupted test used an earlier caller that enabled web retrieval for every stage, so it is not a completed validation of the final production configuration.

## Remaining limits

Web retrieval and ledger extraction are model-driven. A model can misstate access, omit a source, mishandle a quote, or miss a material fact. Deterministic checks cover only the supported calculations supplied in the ledger, not every number in prose. There is no licensed market feed, normalized SEC/XBRL ingestion, independent expert network, full valuation engine or verified transcript service. The DCF lab remains a separate illustrative model with user-supplied inputs. Historical page availability is not established merely by a publication date. Material findings and recommendations require human review.

The optional older API-key report path and manually imported reports do not automatically receive these structured passes. The new no-API full-report path does. The [offline training workflow](TRAINING.md) prepares a future curated dataset and diagnostics; it does not replace live evaluations or train a model.
