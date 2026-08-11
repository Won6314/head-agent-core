# Checkpoint Run

## Trigger

A fresh review HEAD from the active execution authority has persisted the canonical decision for the terminal horizon.

## Exact reads

Read the active immutable execution authority, `run.md`, the executed horizon and Slices, the exact canonical A-review decision, its direct evidence references, and the latest valid ledger. Do not reload worker narrative, `B` narrative, or earlier ledgers by default.

## Authority

The canonical A-review decision owns Plan-level acceptance, local-correction classification, material-change escalation, terminal judgment, and next plan position. This phase applies that substantive decision without extending it. Preferred output formatting is not authority; B uses LLM judgment to distinguish a clear decision from formatting noise, but may not replace or reinterpret the decision's meaning.

## Produced result

1. Copy the canonical A-review decision and its direct evidence references into one new ledger record without summarizing or re-evaluating them.
2. Update only compact route and current-position material in `run.md`; leave evidence bodies and chronology in referenced artifacts.
3. For `CONTINUE`, set the exact A-selected plan horizon as current and route it to `../results/prepare-slice.md`; B materializes execution contracts before dispatch.
4. For `LOCAL_CORRECTION` or legacy `REVISE`, keep the same Plan result current, record the exact Plan-preserving correction, and route it to `../results/prepare-slice.md` for a correction delta against the frozen initial contract.
5. For `PLAN_CHANGE_REQUIRED`, set no executable horizon and return to `plan-run` to produce an explicitly accepted replacement `A2`, `A3`, and so on before execution resumes.
6. For `USER_DECISION`, stop execution and return the exact decision to the user.
7. For `DONE` or `FAILED`, route the exact terminal decision to `finish-run.md`.
8. If the substantive review judgment is genuinely missing, internally inconsistent, or names no valid next consumer, stop rather than letting `B` invent a position. Formatting variation alone is not inconsistency.

## Mutation class

Mechanical Run canon and ledger update from the canonical A-review decision.

## Next consumer

`../results/prepare-slice.md` for an A-selected next result or local correction, `plan-run` for `PLAN_CHANGE_REQUIRED`, the user for `USER_DECISION`, or `finish-run.md` for a terminal decision.
