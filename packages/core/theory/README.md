# HEAD Core Theory

This path explains why HEAD Agent Core is designed around context control. It is not setup documentation, an operating procedure, or an implementation reference.

## Start with the simple theory

[LLM Context Management](context-management/README.md) ([한국어](context-management/ko/README.md)) presents the shortest complete argument. It follows the context of a working LLM through four stages:

1. load only the instructions needed for the current kind of work;
2. retrieve only the knowledge and relationships needed to understand the problem;
3. carry the accepted plan rather than the entire planning process into execution;
4. continue from observable state and a clean plan baseline rather than accumulating the full execution history.

## Go deeper on how the graph is built

[Bring only the knowledge and relationships that are needed](context-management/02-graph-research-context.md) argues for querying a graph rather than loading documents. It assumes a graph that exists and is roughly correct.

[Constructing a Knowledge Graph](knowledge-graph/README.md) ([한국어](knowledge-graph/ko/README.md)) takes up that assumption. It covers what a graph is the authority for, the two axes along which product knowledge accumulates, the three moments a person must decide, how identifier granularity bounds everything downstream, which edges are found and which are assigned, how to record what is not known, and how the graph changes when the world does.

The two series are peers: one is about consuming a graph, the other about producing one.

## Continue with the design background

The following pages add ownership, continuity, evidence, and limits to that context-management model:

1. [Present context and controlled expansion](01-present-context-and-controlled-expansion.md) starts with the immediate problem: a generated result can become an unexamined premise for the next result.
2. [Ownership and context boundaries](02-ownership-and-context-boundaries.md) asks who can decide what, and why each owner needs deliberately composed rather than maximal context.
3. [Continuity and canon](03-continuity-and-canon.md) carries that authority problem across interruption, where a useful summary can still lose the target it summarizes.
4. [Evolution, evidence, and limits](04-evolution-evidence-and-limits.md) closes by treating the response as a revisable operating design with costs, evidence boundaries, and limits.

## Read the extended course

The former bilingual Learn and Teach wiki remains available as [HEAD Core Extended Course v1](../../../deep-dive/head-core-course-v1/README.md). It preserves the longer history, failure stories, rejected alternatives, diagrams, lectures, and workshop material. It is a deep-reading snapshot, not the primary introduction or current implementation authority.

## Evidence boundaries

This background distinguishes **historical record** (archived system material), **operational observation** (experience that is not a universal law), **generalized failure** (a public-safe reconstruction), and **related theory** (an explanatory lens that may be retrospective). The labels limit what a claim establishes: they prevent a plausible explanation from becoming an unsupported history or universal law.

The pages use no private project context, credentials, production details, internal metrics, or instruction bodies. Capability is not authorization: human and project owners retain material direction, mutation, publication, and material communication boundaries.
