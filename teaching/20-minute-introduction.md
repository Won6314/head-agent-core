# 20-Minute Introduction

[HEAD Agent Core](../README.md) / [Teach](README.md) / 20-Minute Introduction

## Outcome

Participants can explain why context composition governs reliable LLM work, why unchecked expansion is risky, how to assign a decision to the User, HEAD, or a bounded Agent, and what evidence is needed before work expands further.

## Preparation

- Open [the controlled-expansion loop](diagrams.md#controlled-expansion-loop).
- Ask participants to bring one familiar example of an AI-generated plan, specification, or implementation. Do not collect private project details.

## Run Of Show

| Time | Activity | Teaching focus | Source |
| --- | --- | --- | --- |
| 0-2 min | Frame the context problem | An LLM acts from assembled context; an output can sound complete while carrying an omission or guess downstream. | [Context](../learn/04-context/README.md) and [One-Step Expansion](../learn/02-llm-problem/the-one-step-expansion-rule.md) |
| 2-6 min | Explain controlled expansion | One coherent expansion becomes trusted input only after an evidence gate. | [Controlled expansion loop](diagrams.md#controlled-expansion-loop) and [Verification Before Expansion](../learn/02-llm-problem/verification-before-expansion.md) |
| 6-10 min | Assign ownership | User: direction and material choices; HEAD: planning and integration; Agent: local method within a locked boundary. | [Decision Rights](../learn/03-ownership/decision-rights.md) |
| 10-15 min | Pair exercise | For a generic generated plan, identify one assumption, its proper owner, and evidence that could check it. | [Match Evidence To The Claim](../learn/02-llm-problem/verification-before-expansion.md#match-evidence-to-the-claim) |
| 15-18 min | Debrief | A worker can act autonomously locally, but cannot invent product policy or scope. | [Bounded Agent Ownership](../learn/03-ownership/bounded-agent-ownership.md) |
| 18-20 min | Close | State one bounded next outcome and its observable completion evidence. | [One-Step Expansion](../learn/02-llm-problem/the-one-step-expansion-rule.md#takeaway) |

Total: 20 minutes.

## Facilitation Notes

Open with the operational claim: "For project work, context is the system." Clarify immediately that this does not mean maximum context. Ask who owns the next decision, which source is authoritative, what is relevant now, and when that information should enter the working set.

Use a neutral example such as "an assistant drafts a public workshop guide." Do not ask whether the model is generally intelligent or unreliable. Ask instead: "What claim would this output make authoritative next, and what could directly check that claim?"

If a participant proposes that the Agent should decide a material direction, return the choice to the User through HEAD. If the decision is a local method within a locked boundary, keep it with the Agent.

## Optional Questions

- [What makes a generated result trustworthy enough to use downstream?](discussion-questions.md#architecture-and-engineering)
- [Which choices become material in your work?](discussion-questions.md#product-and-design)

## Close

The model is not a swarm pattern or a requirement for ceremony. Its roles, canon, procedures, and bounded briefs exist to keep the right context, direction, ownership, evidence, and next expansion visible. Continue with the [60-minute core lecture](60-minute-core-lecture.md) when participants need the context and canon model behind the loop.
