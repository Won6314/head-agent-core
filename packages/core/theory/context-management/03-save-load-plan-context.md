# How to Pass Along the Accepted Plan, Not the Planning Process

[Contents](README.md) · [한국어](ko/03-save-load-plan-context.md)

## The Process of Making a Plan Also Pollutes Context

A good plan is not completed in one pass. It is made by comparing, challenging, revising, and discarding different solution directions.

Much information accumulates in this process.

- Initial ideas and multiple candidates
- Reviewers' questions and objections
- Plans before revision
- Directions already discarded
- Assumptions not yet accepted
- Tool calls and conversations for making the plan

This information is needed while making the plan. But if it is all carried forward to execute the accepted plan, the current direction and past candidates mix in the same context.

The executing LLM must infer again what the final decision is, and may revive discarded ideas as though they were current options.

## The Planning Process and Plan Context Differ

```text
Planning Process
≠
Execution Plan Context
```

Execution does not need the complete record of how the plan was made.

- The objective to solve
- Accepted decisions
- Important constraints
- Major tasks and relationships
- Task order and dependencies
- Success conditions
- The current starting point

In other words, the output of planning should not be meeting notes or a conversation summary, but an **executable decision structure**.

## Save a Clean Problem Understanding

Before planning begins, there is a problem understanding refined in the earlier stage.

```text
User request
+ structure of the current problem
+ needed research findings
+ important constraints
= planning baseline
```

Saving this baseline lets the work return to the original problem and direction even if planning becomes long.

Save here does not mean copying the whole conversation. It means preserving, in a clean state, the problem understanding and user agreement that must become the basis of later judgments.

## Explore Freely, Accept One Plan

During planning, multiple candidates can be explored in parallel. Different approaches can be compared and independently reviewed.

But candidates must not become final plans on their own. The exploration results must reconverge into one overall judgment.

```text
Clean baseline
  ├─ plan candidate A
  ├─ plan candidate B
  └─ independent review C
          ↓
Integrate against the overall objective
          ↓
One accepted plan
```

This brings diverse ideas while avoiding the problem of several plans claiming execution authority at the same time.

## Compress the Accepted Plan into Relationships

An accepted plan is closer to a relationship structure than to a simple list of steps.

```text
[Objective]
  ├─requires──> [Outcome A]
  ├─requires──> [Outcome B]
  └─verifies──> [Success condition]

[Outcome A] ──precedes──> [Outcome B]
[Outcome B] ──produces──> [Consumable output]
```

A relationship structure preserves not only what to do, but why it is needed, what it depends on, and which outcome becomes input to the next task.

This is the core of compressing a plan. It removes the conversation that made the plan but preserves the relationships that retain the execution order and overall outcome.

## Load the Clean Baseline Again

Once the plan is accepted, do not use the session that made the plan unchanged as the execution session. Load the saved clean problem understanding again, and combine only the accepted plan on top of it.

```text
Clean problem understanding a Save
        ↓
Planning, challenges, revisions, and review
        ↓
Accepted plan G Save
        ↓
Load clean a again
        ↓
a + G = execution baseline A
```

In this notation:

- `a` is a baseline that preserves the user request and refined problem understanding.
- `G` is a plan structure containing accepted objectives, decisions, tasks, and relationships.
- `A` is context for judging execution without the noise of the planning process.

The purpose of Save/Load is not to preserve more memory. It is to **return to the needed baseline and reassemble only accepted results**.

## A Summary Alone May Not Be Enough

Passing a short summary of the last planning conversation is simple. But a summary can mix what was agreed with what was explanatory, or omit one of two connected success conditions.

A structured plan distinguishes at least the following.

- Objectives and explanations
- Accepted decisions and open questions
- Dependencies between tasks
- Success conditions and reference material
- The scope to execute now and the scope for later

Not every plan needs a graph file. For small tasks, a short, clear plan document is enough. What matters is not the format, but separating the plan-generation process from the accepted result needed for execution.

## Create a New Baseline When Direction Changes

An important plan change may be needed during execution. If revisions are continually added to the existing execution context, the old and new plans remain together.

It is better to make important changes into a new accepted plan and compose a new execution baseline by combining it with the clean baseline.

```text
Existing plan A
  ↓ important change needed
New plan G1 accepted
  ↓
Compose new execution baseline A1
```

What constitutes an important change depends on the nature of the work and the boundary of user decisions. There is no need to remake the whole plan for every simple implementation revision.

## Conclusion

> The planning process is needed to make a plan, but execution needs the accepted plan, not the planning process.

Save a clean problem understanding, develop the plan freely, then load only the accepted decision structure again. This lets the executing LLM focus on the current plan rather than past candidates.

The next article explains, once execution has started, [how to save and continue from current state instead of the complete work record](04-save-load-execution-state.md).
