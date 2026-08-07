# How to Refine Research Context with a Graph

[Contents](README.md) · [한국어](ko/02-graph-research-context.md)

## More Material Does Not Necessarily Mean Better Understanding

Understanding a problem requires material. Documents, Wikis, code, search results, and historical records are all important source materials.

But providing many sources is different from creating good research context. Even if the context window grows, the model does not use everything in it equally well. Core information competes with duplication, old explanations, and surrounding material.

```text
Context Window
= the maximum amount of information that can be included

Effective Context
= task input that actually helps the current judgment
```

So the goal of research context is not to collect as many documents as possible. It is to compose, at high density, the facts and relationships needed for the current question.

## Documents Inevitably Contain Noise

Documents are not written to answer only one question. They preserve knowledge, explain background, and help different readers understand.

So even good documents naturally include the following.

- Background and history
- Examples that aid understanding
- Repetition and summaries
- Sentences that connect context
- Additional explanations for other readers
- Details unrelated to the current question

This content is necessary in a document. But when answering a particular question, some of it becomes noise.

> It is not that the document is bad. The document's purpose differs from the purpose of the current LLM context.

The same sentence can be core information or noise depending on the question. Therefore, it is difficult to create clean context for every question by including whole documents unchanged.

## Wiki, Tree, and General RAG

Existing approaches each solve important problems.

### Wiki: Preserves Documents and Pages

A Wiki is good for people to write and explore knowledge. Pages also link to one another. But it often takes reading the text to know whether a link means dependency, implementation, change, or contradiction.

The basic unit of a Wiki is still the document or page.

### Tree: Shows One Hierarchy

A tree clearly expresses relationships between parent and child, category and item. But one real-world object connects to many policies, features, and files at the same time. A single parent-child hierarchy struggles to express these many-to-many relationships.

### General RAG: Finds Similar Chunks

RAG finds document chunks that are semantically similar to a question, reducing the cost of including entire documents.

```text
Question
→ relevant chunk A
→ relevant chunk B
→ relevant chunk C
```

But if search results are independent pieces of text, the LLM must infer the relationships again.

- Do A and B refer to the same object?
- Which is the cause and which is the result?
- Which policy applies to which implementation?
- If several chunks conflict, what is the current state?

RAG finds relevant sentences, but does not always provide how those sentences connect.

## In a Graph, Relationships Become Information

A graph uses entities and relationships as its basic units.

```text
[Feature A] ──is governed by──> [Policy B]
[Feature A] ──is implemented in─> [File C]
[Feature A] ──depends on───────> [Feature D]
[Change E] ──modifies──────────> [Feature A]
```

The type and direction of relationships that were embedded in document sentences become explicit information.

A graph can seem like merely adding another link. The important difference is that the relationship is not supplementary explanation; it becomes the basis for retrieval and assembly.

## Search Results Themselves Become a Relationship Map

The result of ordinary search is a list of relevant materials. The result of graph search is a subgraph in which entities relevant to the question connect to one another.

```text
             [Policy B]
                 ↓ governs
[Change E] → [Feature A] → [File C]
                 ↓ depends on
             [Feature D]
```

This result already includes the following.

- The entity at the center of the question
- Surrounding information to consider together
- The type and direction of relationships
- The scope explored
- Paths back to other source texts

In other words, graph retrieval brings both relevant information and the structure for understanding it.

> Ordinary search returns relevant content. Graph search also returns how the relevant content connects.

## The Relationship Map Is Compressed Twice

Graph compression is not simply reducing the number of characters. It removes surrounding narrative while preserving the relationships needed for explanation.

The first is **representation compression**.

```text
Explanations scattered across documents
→ entities and relationships
```

The second is **query compression**.

```text
Entire graph
→ subgraph needed for the current question
```

So the overall flow is as follows.

```text
Documents · code · records
  ↓ extract entities and relationships
Graph
  ↓ explore relationships relevant to the question
Subgraph
  ↓ reconstruct in natural language
Refined research context
  ↓
LLM
```

## Turn the Relationship Map Back into Prose

Natural language is the format best suited to the LLM's final use. Therefore, the goal is not to throw the graph at it unchanged.

For example, suppose the graph finds these relationships.

```text
Feature A → is governed by Policy B
Feature A → is implemented in File C
File C → is also used by Feature D
Change E → modifies the current behavior of Feature A
```

They can be composed for the question as follows.

> Feature A is governed by Policy B and is implemented in File C. Because File C is also used by Feature D, the impact on D should also be checked when changing it. Judge current behavior from the state after Change E.

The entire source document is not included, but the relationships needed for judgment remain. Instead of first guessing structure from scattered chunks, the LLM can focus on the problem using already organized material for thought.

## A Graph Does Not Replace Source Texts

A graph can also be incorrect or old. The absence of a relationship does not mean that no real relationship exists.

Therefore, it is safer to use a graph as a **compressed relationship index** rather than as truth itself.

```text
Find related relationships in the graph
→ confirm the needed current source texts
→ make a judgment
→ update if there are old relationships
```

Wikis and documents preserve sources, RAG finds relevant text, and graphs compose the research scope by following relationships. These approaches are not completely exclusive. Broadly speaking, graph-based retrieval is also a form of RAG.

The reason to use a graph is not that it is always superior in every situation. It is that it is well suited to making smaller research context for work that must reconstruct multiple relationships together, such as those among documents and features, or policies and implementations.

## Conclusion

> The result of graph retrieval is not a simple list of documents, but an already compressed relationship map. Reconstructing this map as prose for the question can convey higher-density meaning with fewer tokens.

The refined research result now becomes input to planning. The next article explains [how to pass only the accepted plan, rather than the whole process that produced it, into execution](03-save-load-plan-context.md).
