# Context Is Not Memory

[HEAD Agent Core](../../README.md) / [Learn](../README.md) / [The LLM Problem Model](README.md) / Context Is Not Memory

## Learning Objective

Build a practical mental model for why important work cannot depend on an LLM conversationally "remembering" the same meaning forever.

## The Actor Analogy

An LLM conversation feels continuous. The assistant refers to earlier decisions, preserves tone, and appears to remember what happened.

For operations, I use a less comfortable analogy:

> The model is closer to an actor who receives a script and performs the next scene than a colleague who continuously owns a lived memory of the project.

The script may include the conversation, system instructions, retrieved documents, tool results, and summaries. The model interprets what it receives now. If a critical constraint is absent, buried, contradicted, or summarized incorrectly, the performance can change even though the conversation appears continuous.

```text
previous conversation
        +
system and project instructions
        +
retrieved evidence
        +
generated summaries
        |
        v
current context presented to the model
        |
        v
next response or action
```

## Where The Analogy Helps

The analogy highlights four operational facts.

### Presence Matters

A fact stored somewhere in the project does not influence the current result unless the model receives it or knows how to retrieve it.

### Placement Matters

An authoritative requirement can compete with stale conversation, a worker report, or a recent summary. The model is not guaranteed to infer the intended authority hierarchy from volume or recency alone.

### Compression Changes Meaning

When a long conversation is compacted, details may be omitted and distinctions may collapse. "One part is complete" can become "the work is complete." An unresolved assumption can disappear entirely.

### Repetition Is Not Ownership

A model can repeat a decision without owning the right to change it. Decision authority must be represented explicitly outside the model's apparent confidence.

## Where The Analogy Breaks

The actor analogy is not a literal description of every model implementation. Runtime systems may cache tokens, persist conversation records, retrieve memory, or use hidden state within one generation. Models can also reason over long context better than the analogy suggests.

The practical point is narrower: none of those mechanisms should be treated as a durable project authority unless the system deliberately makes them one.

## Design Response

HEAD separates several things that a casual chat tends to blur:

| Need | External representation |
| --- | --- |
| Stable behavior | Shared and project Core |
| Where project authority lives | Project information index |
| What this session is about | Session context |
| What the user and HEAD agreed to accomplish | Run canon |
| What happened recently | Retrieval-only progress and history |
| What is true now | Rechecked primary evidence |

The model still reads a script. The system improves the script's authority, relevance, and recoverability.

## Generalized Failure

A long task survived several rounds of conversation. After compaction, the summary retained recent outputs but dropped the original success condition. The assistant continued fluently, reviewed the latest artifact, and declared completion. The conversation felt coherent; the task was no longer the same task.

The correction was not a better reminder phrase. It was to keep the original agreement in a stable external record and load it directly after compaction.

## Common Misunderstanding

"Context is not memory" does not mean the model has no continuity or that every prompt must repeat everything. It means continuity is a system property that must be constructed from canonical records, deliberate retrieval, and explicit authority.

## Takeaway

Do not ask whether the model remembers. Ask which sources it is reading now, which source is authoritative, and whether the current context preserves the user's actual agreement.

Next: [The One-Step Expansion Rule](the-one-step-expansion-rule.md)

Source class: operational analogy, current context architecture, and generalized compaction failure.
