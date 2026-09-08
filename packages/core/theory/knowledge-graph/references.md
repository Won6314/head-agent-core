# References

[Index](README.md) · [목차](ko/README.md)

Supporting material for the [knowledge graph construction](README.md) pages. Kept separate so the argument can stay about principles and free of vendor and language specifics. This file is not mirrored — entries are titles, URLs, and short English annotations.

Each entry notes what it establishes and, where relevant, what was not verified. Nothing here is an endorsement; the pages deliberately prescribe no tool.

---

## Concept assignment and feature location

Supports [identity decides resolution](04-identity-and-resolution.md) and [what machines produce and what judgment produces](05-deterministic-backbone.md).

- **Biggerstaff, Mitbander, Webster — "The concept assignment problem in program understanding" (1993/1994).** Frames mapping domain concepts onto code as a problem that structural parsing alone cannot solve; requires plausible reasoning. The origin point for treating assignment as judgment rather than extraction.

- **Eaddy — dissertation, and "Identifying, Assigning, and Quantifying Crosscutting Concerns."** http://www.cs.columbia.edu/~eaddy/Dissertation.pdf — introduces concern metrics (Degree of Scattering, Degree of Focus). Establishes that scattering measured at file granularity and at method granularity are not comparable, and that a concern which looks localized at file level may be strongly scattered at method level. This is the measured basis for the resolution argument.

- **Dit, Revelle, Gethers, Poshyvanyk — "Feature location in source code: a taxonomy and survey," JSEP 2013.** https://onlinelibrary.wiley.com/doi/abs/10.1002/smr.567 — surveys ~89 papers (1992–2011) across textual, dynamic, structural, and historical techniques. Conclusion relevant here: no single technique dominates across systems, and hybrids reduce complementary weaknesses. Survey data also at https://www.cs.wm.edu/semeru/data/feature-location-survey/

- **Liu, Marcus, Poshyvanyk, Rajlich — SITIR, ASE 2007.** https://www.cs.wm.edu/~denys/pubs/LiuMarPosRaj.SITIR.ASE07.pdf — single execution trace prunes candidates, then textual ranking orders them. Outperformed both pure textual and pure dynamic on the studied systems.

- **Poshyvanyk et al. — PROMESIR (2007).** Rank fusion of a dynamic ranking with a textual ranking. Together with SITIR, the empirical basis for "one source of evidence is not enough."

- **Razzaq, Le Gear, Exton, Buckley — "An empirical assessment of baseline feature location techniques," EMSE 25:266–321 (2019).** https://link.springer.com/article/10.1007/s10664-019-09734-5 — compares eight baselines across twelve cases. Two findings carried into the pages: differences between *implementations* of the same model are statistically significant, and system/benchmark effects often dominate technique effects. The authors recommend a single vector-space baseline. Scope caveat: IR baselines only; the study does not address LLM-produced assignment.

---

## Architecture conformance

Supports [two axes and where they cross](02-two-axes.md) and [what descends and what ascends](07-descent-and-ascent.md).

- **Murphy, Notkin, Sullivan — "Software reflexion models," FSE 1995; journal version IEEE TSE 2001.** The canonical form of comparing an intended high-level model against an extracted source model, yielding three verdicts: **convergence** (present in both), **divergence** (present only in the source), **absence** (present only in the intended model). The five outcomes used in [what descends and what ascends](07-descent-and-ascent.md) are a superset — they add *unresolved* as an explicit null and separate agreement from the two one-sided cases.

  Load-bearing precondition, and the reason the comparison cannot be computed without it: reflexion requires **source dependency edges** and a mapping into high-level nodes. A graph holding only attachment edges (code → name) has neither, and can produce none of the three verdicts.

- **Passos, Terra, Valente, Diniz, Mendonça — "Static Architecture-Conformance Checking: An Illustrative Overview," IEEE Software 27(5), 2010.** https://www.dcc.ufmg.br/~mtov/pub/2010_ieeesw.pdf — three families: dependency-structure matrices, source-code query languages / constraint DSLs, and reflexion models.

- **Pruijt et al. (~2013–2017)** — comparative evaluation of conformance tools. Recurring measured result: static dependency detection is incomplete in practice, which bounds what any conformance verdict can claim.

---

## Symbol indexing and code graph formats

Supports [identity decides resolution](04-identity-and-resolution.md). Verified as of 2026-09; maturity claims below reflect documentation read at that time, not runs against any particular repository.

- **SCIP — Sourcegraph Code Intelligence Protocol.** https://github.com/scip-code/scip · design https://github.com/scip-code/scip/blob/main/docs/DESIGN.md · CLI https://github.com/scip-code/scip/blob/main/docs/CLI.md · announcement https://sourcegraph.com/blog/announcing-scip

  Symbol-level: `Symbol`, `Occurrence` (range plus definition/reference/import roles), `Relationship`, `Document`. Structurally computed symbol identifiers — the concrete form of the stable-identity argument. Export via `scip print --json`, protobuf bindings, or experimental SQLite conversion; no official graph-database connector was found.

  Two documented caveats worth carrying: file-level incrementality is stated as a protocol *goal*, not an implemented indexer feature; and the design explicitly lists efficient navigation as a **non-goal** — SCIP is a transport format, not a query store.

- **scip-typescript.** https://github.com/sourcegraph/scip-typescript — official TypeScript/JavaScript indexer; README documents `--pnpm-workspaces`. The most direct symbol-layer option for a TypeScript monorepo among those surveyed. Not run against any repository in this survey.

- **LSIF.** https://github.com/microsoft/language-server-protocol/blob/master/indexFormat/specification.md · indexer https://github.com/microsoft/lsif-node — predecessor to SCIP. Deprecated and removed on the Sourcegraph side; scip-typescript documents a migration path from `lsif-node`. Listed for historical continuity, not as a current option.

- **Stack graphs.** https://github.com/github/stack-graphs · introduction https://github.blog/open-source/introducing-stack-graphs/ · paper arXiv:2211.01224 · TypeScript rules https://github.com/github/stack-graphs/blob/main/languages/tree-sitter-stack-graphs-typescript/README.md

  The cleanest published treatment of *incremental* name binding with per-file isolation — directly relevant to the invariant that incremental resolution cannot exceed identity resolution. **The repository was archived by its owner on 2025-09-09**, so it is cited here as design precedent, not as available infrastructure.

- **Code Property Graph / Joern.** https://docs.joern.io/code-property-graph/ · JS/TS frontend https://docs.joern.io/frontends/javascript/ · export https://docs.joern.io/export/ · spec https://cpg.joern.io · original paper Yamaguchi et al., IEEE S&P 2014, https://fabianyamaguchi.com/files/2014-ieeesp.pdf

  Merges AST, control flow, and data dependence into one property graph — resolution below the symbol, at statement and expression level. Export to graph databases is the most direct of any option surveyed. The ontology is oriented toward vulnerability pattern mining, not purpose attribution, and incremental update is not documented.

- **Glean.** https://glean.software/ · incremental design https://glean.software/blog/incremental/ · TypeScript path https://glean.software/docs/indexer/lsif-typescript/

  The strongest documented incrementality of those surveyed: unit ownership, stacked databases, `--incremental` with exclusion. TypeScript support is SCIP absorbed via `scip-to-glean`, so TypeScript semantic quality is bounded by scip-typescript. Operational weight is substantial.

- **Kythe.** https://kythe.io/ · TypeScript indexer https://github.com/kythe/kythe/blob/master/kythe/typescript/README.md · schema https://kythe.io/docs/schema

  VName-based facts and edges at symbol level. A TypeScript indexer exists in the source tree; official release tarballs center on other languages, so it requires building from source. Incrementality is compilation-unit based rather than change-based.

- **dependency-cruiser.** https://github.com/sverweij/dependency-cruiser — file/module import edges for JavaScript and TypeScript, with forbidden/allowed path rules and a documented cache (metadata and content strategies). Resolution is the module, not the symbol. The cheapest way to obtain the structural dependency edges that reflexion requires.

---

## Division of labor between deterministic extraction and judgment

Supports [what machines produce and what judgment produces](05-deterministic-backbone.md).

- **CodexGraph — Liu et al., NAACL 2025; arXiv:2408.03910.** https://arxiv.org/abs/2408.03910 · https://aclanthology.org/2025.naacl-long.7/

  Graph schema and node/edge extraction are static analysis; the language model writes queries against the graph and interprets results. Reported ablation: removing the query-translation agent drops exact match from 27.90 to 8.30 on the studied benchmark. Evaluated on Python only; the authors note call edges are incomplete.

- **KGCompass — Yang et al., arXiv:2503.21710.** https://arxiv.org/abs/2503.21710

  Code entity graph (files, classes, functions; containment, call, import) and issue/PR links are mined deterministically. The model supplements graph-ranked candidates and generates patches and reproduction tests. Reported: 89.7% of successful localizations required multi-hop traversal because the issue text carried no location hint.

- **Common pattern across these systems.** Structural edges are produced deterministically; the model searches, ranks, explains, and generates. The model does not author the canonical structural edges. Reproducibility measures include fixed schemas, temperature control, hashing static results, and keeping model output in a separate layer.

  Not found in this survey: any study evaluating LLM-produced file-level attribution edges against a gold set. The systems above are repair and completion benchmarks, not attribution benchmarks — so the pages state the division as observed practice, not as a measured result for attribution specifically.

---

## Not verified

Recorded so that absence of an entry is not read as a judgment.

- ArchUnit (https://www.archunit.org/) — JVM bytecode; TypeScript support not confirmed.
- Sonargraph — vendor pages state TypeScript support from version 14 (2024); the rule DSL was not read, so equivalence to reflexion verdicts is unconfirmed.
- Structure101 — reported discontinued as an independent product; treated as unavailable.
- tsarch — surfaced in search as an ArchUnit-style TypeScript library; repository documentation not opened.
- Joern incremental update — issue #5865 discusses a prototype for one frontend; not documented as a feature.
