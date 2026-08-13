# Dispatch Horizon

## Trigger

The Runner has frozen-ready Execution Contracts for the exact selected horizon.

## Authority

The Runner dispatches the selected horizon without changing membership, Result meaning, schedule, review destination, or next position. Workers return Produced Result and Worker Report/Evidence only.

## Produced result

Freeze each exact Execution Contract and dispatch each Worker with only its contract and referenced sources. Route the terminal aggregate, Produced Results, Worker Reports, and Evidence directly to [review-checkpoint.md](../run/review-checkpoint.md). The Runner performs no integration, review, correction selection, or next-work selection.

## Next consumer

Saved-Planner Checkpoint review.
