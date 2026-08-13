# Select Horizon

## Trigger

Ready Plan Results need one dependency-safe horizon.

## Authority

The Planner or a saved-Planner Checkpoint selects the horizon. The Runner cannot schedule work.

## Produced result

Exclude Results whose Plan-level contract or consumer is incomplete. Defer missing predecessors and sequence connected decisions, shared mutable state, or output dependencies. Put every remaining independent ready Result into one horizon. Before acceptance, return it to [accept-plan-baseline.md](../planning/accept-plan-baseline.md); after checkpoint acceptance, the Runner prepares exact Execution Contracts.

## Next consumer

Accepted Plan Baseline acceptance or Execution Contract preparation.
