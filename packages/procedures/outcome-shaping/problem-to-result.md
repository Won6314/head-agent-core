# Problem-to-Result

Use this procedure with `outcome-shaping` to make a problem consumable before work ownership is selected.

## 1. Problem Definition

Record the current state, needed state, real consumer, and the authoritative
facts that establish the gap. State the consumer's observable need, not a
proposed implementation.

## 2. Observable Goals And Evidence

For each goal, state the observable result and the evidence by which its real
consumer accepts it. Keep only goals and evidence that can change selection or
completion.

## 3. Solution Alternatives And Decision Authority

Compare alternatives that materially differ in consumer-visible behavior,
product, policy, architecture, cost, workflow, or consequential external
action. Return those choices to the user. Record why the selected alternative
meets the goals once a user-owned choice is decided.

## 4. Selected Solution

Record the selected solution, its locked decisions, and the behavior and state
that it preserves. This is the authority for Result Graph formation; it is not
an execution instruction by itself.

## 5. Result Graph

Split the selected solution only at independent consumption boundaries. For
every Result, record:

1. its authoritative inputs and dependencies;
2. its required observable output or state;
3. its real next consumer;
4. its acceptance boundary and representative success evidence; and
5. its mutation boundary and the behavior or state to preserve.

A Result is ready when its next consumer can use it without reconstructing
HEAD's reasoning. Do not split merely by activity, role availability, or
implementation sequence.

## 6. Execution Route

Choose direct work when HEAD's current context and proof remain connected.
Choose `delegate-once` when one Result has a smallest complete worker I/O
contract and can be independently implemented, proved, and returned once.
Choose a durable Run when the selected solution has dependent Results that need
durable coordination, checkpoints, or recovery.

## Representative Models

### Non-software result

A community organizer's current state is that attendees cannot tell whether a
venue is accessible; the needed state is an accessibility notice consumed by
prospective attendees. The observable goal is a notice that states entrance,
seating, and contact information; the evidence is the published notice those
attendees can read. Alternatives are a short notice or a venue-map campaign;
the organizer selects the short notice. The Result Graph contains one Result:
the approved notice, consumed by prospective attendees, accepted when it
contains the selected facts, with no venue-policy mutation. It can be direct
work or one one-shot result.

### Software specialization

A service currently returns an ambiguous renewal status; its needed state is a
specified status consumed by the billing client. `dev-system-shaping` applies
this procedure by tracing the authoritative request through the current path,
assigning the behavior to responsible components, and selecting the smallest
implementation shape. If HEAD selects a developer Result, the same uncertainty
about the wording of an internal status can be locally diagnosed and decided
inside the fixed I/O boundary. If HEAD selects a coder Result, that uncertainty
is an observable interface choice: Coder returns a contract conflict before
mutation until the Execution Contract fixes it.
