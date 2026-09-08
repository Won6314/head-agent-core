# LLM Context Management

[한국어](ko/README.md)

## Context Is Practical Performance

An LLM produces its next result from the context currently provided. No matter how capable the model is, it cannot use information it cannot see; when much irrelevant information is mixed in, what it should focus on becomes unclear.

So the result of practical LLM work cannot be explained by the model alone. The following is not a literal equation, but a useful heuristic: the same model can behave very differently under different context.

```text
Practical task result
≈ the model's reasoning capability × the quality of the current context
```

Here, context quality is not merely the amount of information. It means that the information needed for the current task has been selected, its relationships are visible, and information unrelated to work that has already finished has been removed.

> Making an LLM work well is ultimately deciding what it should see now.

## Four Stages of Task Context

The context needed when an LLM performs a long task broadly flows through four stages.

```text
1. Task instructions
        ↓
2. Understanding and research
        ↓
3. Solution plan
        ↓
4. Task execution and progress
```

The result of each stage becomes input to the next. Therefore, noise and omissions from earlier stages carry into later ones and can sometimes be amplified into more plausible-looking forms.

This material applies the same principle in different ways across the four stages.

1. [Load only the task instructions that are needed](01-instructions-on-demand.md).
2. [Bring only the knowledge and relationships that are needed](02-graph-research-context.md).
3. [Pass along the accepted plan, not the planning process](03-save-load-plan-context.md).
4. [Continue from the current state, not the execution record](04-save-load-execution-state.md).
5. [Context Compilation Architecture — 전체 이론 정리](ko/05-context-compilation-architecture.md).
7. [컨텍스트 일반론 — 무엇이 창 안에서 돕고 무엇이 해치는가](ko/07-context-general-principles.md) (초안 v0).

## A Context Window Is Not Focus

The context window is the maximum amount of information the model can receive at once. It does not mean that the model uses everything in it equally well.

```text
Context Window ≠ Effective Context
```

Making a warehouse larger does not automatically organize the workbench. When unnecessary information, similar explanations, old decisions, and repeated records arrive together, the model has more work to do to select the core information and interpret its relationships.

So good context management is not filling the window as much as possible. It is providing enough information to change the next judgment while leaving out other noise.

## Noise Depends on the Question

Noise does not mean only incorrect information. Even a fact can be noise at that moment if the current question does not need it.

```text
Noise
= information not needed for the current judgment
```

Therefore, it is difficult to make one perfect, giant prompt that works for every task. Good context is not one document completed in advance; it is task input continuously reassembled according to the task stage and the current question.

## One Shared Principle

The four stages use different techniques but point in the same direction.

```text
Always include everything
        ↓
Irrelevant information and process accumulate

Select only what is needed now
        ↓
Build a small, high-density context
```

This material is not a scientific theory that explains the internal cognition of a particular model. It is an operational model for composing context in practical LLM work. If the scale and risk of a task are small, not every stage needs elaborate structure. What matters is not the structure itself, but enabling the next judgment to be made on cleaner input.

Start with [how to divide and load task instructions](01-instructions-on-demand.md).
