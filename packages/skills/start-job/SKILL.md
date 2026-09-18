---
name: start-job
description: >
  Problem → goal → how it gets solved. Run before proposing or making any
  solution — a plan, a change, a tool, a procedure, a delegation — however
  small. Grounds each step in what already exists and keeps only what the
  goal needs; stays short when the problem is plain.
---

# Start Job

Reason from the problem to the next action, one step at a time, and show the steps. A plain problem takes a few lines.

1. **Problem and goal.** State the problem and the result that would solve it. Ask the user until both are concrete. A user-facing product result is shaped through `product-planning` (problem → user value → user flow). Name the job with a short slug; its first checkpoint carries it as the `work` label.
2. **What already exists.** Search what already exists for this goal — graph, canon, code, prior work and decisions, existing tools and skills — and read it. For a change to software or a system, trace the current path from its input to where the result is used. Say what was found.
3. **Reason step by step.** Ask of the goal "how does this get solved?" and answer from what was found. Ask the same of that answer until the next action is plain. Where solutions differ materially in product, policy, architecture, cost, or workflow, lay them out and let the user choose. For example:
   - Problem: the LLM starts work without looking at existing materials.
   - Goal: it reads what exists before it plans.
   - How is that solved? → The instructions it follows must make it look first.
   - How? → Core's planning item gains a line to search before planning.
   - Next action: draft that line and show it.
4. **Keep it small.** Check each step against the goal: it is needed, and nothing simpler already serves — an existing material, a sentence instead of a tool, one direct edit instead of a procedure. Drop the rest and say what was dropped.
5. **Act.** Show the reasoning and the next action. The next action is direct work, `delegate-once` for one bounded result another owner returns whole, or `plan-run` for dependent results carried across checkpoints.

A worker's `[from <agent> msg:<id>]` question → `agent-reply`.
