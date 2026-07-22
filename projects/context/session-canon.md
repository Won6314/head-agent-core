# Session Canon

[HEAD Agent Core](../../README.md) / [Additional Context](README.md) / Session Canon

| Property | Value |
| --- | --- |
| Delivery | Current session identity and run are loaded; supporting records are on demand |

## Why It Exists

Durable work needs an authoritative agreement that survives interruption and model compaction. Session canon separates stable identity and the full work contract from fragile summaries and historical retrieval records.

## Boundary

The project owns session storage and naming. Runtime recovery may reload the canon, but generated progress or history must not silently replace the agreed work.
