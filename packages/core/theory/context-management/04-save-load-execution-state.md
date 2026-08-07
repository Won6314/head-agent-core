# How to Continue from Current State, Not the Execution Record

[Contents](README.md) · [한국어](ko/04-save-load-execution-state.md)

## Process Accumulates as Execution Gets Longer

Executing work creates many records.

- Tool calls and work logs
- Failures and retries
- The executor's intermediate reasoning
- Explanations of work already completed
- Past checkpoints
- Temporary files and conversations used to produce the result

These records are useful for tracing errors or auditing the past. But if all of them are included in the basic context for judging the current state and choosing the next task, noise grows as work proceeds.

Continuing a long task is not the same as continuing to remember every process.

## Execution History and Current State Differ

```text
Execution History
≠
Current Execution State
```

What the current judgment usually needs is the following.

- What has changed compared with the original plan
- What was produced since the last judgment
- How well the current result meets the success conditions
- What important changes departed from the plan
- What evidence can directly verify the result

By contrast, records of who called which tool how many times and which sentences they thought can remain available for retrieval when needed. They do not need to be in the current context all the time.

## Save State

Save observable state to continue execution.

One way to express this is to distinguish the starting state, the previously accepted state, and the current state.

```text
S0    = state at the start of the work
Sprev = accepted state at the previous checkpoint
Scur  = current execution state
```

With these three states, two changes can be seen without rereading the complete execution record.

```text
diff(S0, Scur)
= cumulative change from the beginning to now

diff(Sprev, Scur)
= change produced since the previous checkpoint
```

The cumulative change shows whether the overall direction and scope are being maintained. The latest change shows what the current work actually produced.

State can be a code diff, a new version of a document, data state, a design result, or an executable artifact. What matters is to use an actually observable result as the basis, rather than a description of the work.

## Attach Reasons and Evidence for Important Changes

State differences alone cannot support every judgment. If there is an important change not directly stated in the plan, provide why it changed and what can verify it together.

```text
Current judgment input
= cumulative state change
+ state change from this work
+ reasons for important changes
+ directly verifiable evidence
```

The reason here is not the executor's long self-explanation. It is a short, source-connected account of why an important change that the current plan alone does not explain was needed.

## Load the Clean Plan Baseline

The executing LLM knows its own work process best. That also makes it easy for it to make its own choices sound plausible.

Therefore, do not leave checkpoint judgment to the execution narrative alone. Load the clean plan baseline made in the previous stage again, and combine it only with changes in current state and their evidence.

```text
Load clean plan baseline
+ diff(S0, Scur)
+ diff(Sprev, Scur)
+ reasons and evidence for important changes
= checkpoint judgment context
```

This structure does not assume the executor is wrong. It separates the context that judges the plan from the context that produced the execution process, reconnecting the result to the original objective.

## Judgment Results Should Be Small

The purpose of a checkpoint is not to create another long report. It is to determine the next action. For example, the result can be kept to a small set like the following; the names and number can vary by implementation.

```text
Continue
Revise the result or execution
Request an important user decision
Complete the overall result
Fail under the current conditions
```

Keep only the needed decision, a short reason, and the next location in the judgment result. The execution context receives that decision and performs the next task.

```text
Execution
  ↓ state Save
Review from the clean plan baseline
  ↓ decision
Execution context loads the decision
  ↓
Next execution
```

This also prevents the review process itself from accumulating unnecessarily in the next execution.

## If the Plan Is Wrong, Do Not Fix Only Execution

If the current result's problem is a simple execution error, it can be corrected within the same plan. But if succeeding requires changing the objective, major structure, or important constraints, return to planning.

```text
Execution problem
→ revise within the same plan

Plan problem
→ accept a new plan
→ compose a new execution baseline
→ replace the execution context
```

Without this distinction, the execution context can gradually revise the plan and effectively create a new direction. The relationship between the original plan and current behavior then becomes unclear.

## An Example from HEAD's Design

The following is a conceptual example of applying this theory to HEAD's Save/Load design. The detailed checkpoint contract can still evolve, and this notation does not freeze the current implementation protocol.

- `A`: a judgment baseline with a clean problem understanding and an accepted plan
- `B`: an execution context that performs the actual work and integrates results
- `S0`, `Sprev`, `Scur`: observable states of the work
- Checkpoint: a judgment made in `A` from state changes and evidence

```text
Execution B
  ↓ current state Save
Generate state differences and evidence
  ↓
Load plan baseline A for review
  ↓
Continue | revise | user decision | done | failed
  ↓
B receives the decision for the next execution
```

Specific storage formats and checkpoint protocols can vary by implementation. The core of the theory is not keeping the whole execution record as current context, but separating the plan baseline and observable state, then reassembling them when needed.

## Use Small Structure for Small Tasks

Not every task needs state snapshots and formal checkpoints. For a small task that finishes in one pass, directly confirming the current result is enough.

Save/Load structure becomes useful in the following cases.

- The task crosses multiple context windows.
- Multiple outcomes have dependencies.
- Execution and judgment need to be separated.
- Work must resume at the exact position after interruption.
- The cost of continuing in the wrong direction is high.

The purpose of the structure is not to increase ceremony, but to keep the current judgment context small and accurate even in long work.

## Conclusion

> Continuing execution does not mean remembering every process. It means saving current state, judging the next action again from a clean plan baseline, and loading only the needed decision into execution.

Here, the four stages come together into one flow.

```text
Load only the needed instructions
→ bring only the needed knowledge and relationships
→ make only the accepted plan the execution baseline
→ continue only the current state and needed decisions
```

LLM context management is not a technique for making it remember more. It is a technique for making what the next judgment needs visible more cleanly.
