---
name: start-run
description: Use only when HEAD Core selects the Run delegation level; create the planned checkpoint route, then load delegate-task for the current result.
---

# Start Run

Use this procedure after Session shaping has made the outcome clear and HEAD has selected a Run. Run production is delegated; HEAD owns the route, checkpoints, integration, and conclusion.

## Anchor The Run

1. Read the runtime header and current Session identity.
2. Carry forward the whole outcome, locked user decisions, working state, and assets worth preserving.
3. Map the major outcomes, dependencies, and consumable results needed to navigate the Run.
4. Select the first coherent outcome and its next observable result.
5. Retrieve prior context only when it can change the Run's interpretation, route, or result.

## Prepare Thin Canon

Create `sessions/{session}/runs/{runId}/run.md` as the user–HEAD agreement and whole-route map. Preserve:

- the outcome and current state that matters
- material locked boundaries and decisions
- the major coherent outcomes and their dependency order
- a compact checklist or equivalent progress map
- the current position and next consumable result
- success conditions grounded in observable behavior or state

Keep `run.md` navigational. Put optional detail in `plan.md` and chronology or evidence in the ledger or referenced artifacts.

## Prepare The Initial Position

1. Create the initial START ledger with expected state, observed canon preparation, direct references, decision, and next position.
2. Load `delegate-task` to select the worker and compile the first owner-specific Slice.
3. Keep the Run and Slice progress maps aligned.
4. Do not enter Run mode until the route and first delegated result are ready.

## Enter Run Mode

1. Prepare the canon, initial ledger, and first Slice while the runtime remains in Session mode.
2. Call `head_session(action = "start_run", run_id = "{runId}")` only after they are valid.
3. Treat the successful transition and runtime header as authority for active Run mode.
4. Continue an active Run from its canon instead of repeating this entry procedure.

## Work By Meaningful Checkpoints

1. Let the selected worker carry the outcome through correction and representative primary-path execution.
2. Compare returned artifacts and observable state with the whole Run outcome.
3. Record observation, evidence, decision, and next position in a new ledger record.
4. Update the compact progress map, select the next outcome, and load `delegate-task` again.
5. Revise the route only when evidence, a changed requirement, or a disproved assumption changes the work model.

## Recover Compactly

Recover an active Run from:

1. shared Core and project additions
2. Session `context.md`
3. `run.md`
4. the latest valid ledger record
5. only the explicit current Slice named there

Retrieve `plan.md` sections and direct artifacts only when they can change the current judgment. The latest Run ledger governs current position.

## Finish The Run

1. Confirm that the agreement, success conditions, and representative primary-path result hold in actual artifacts or observable state.
2. Record the terminal observation, evidence, decision, and bounded handoff.
3. Call `head_session(action = "finish_run", run_id = "{runId}", session_handoff = "{handoff}")`.
4. Return to Session only after the transition succeeds.
