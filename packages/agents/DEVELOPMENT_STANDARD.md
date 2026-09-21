# Development Standard

Use for software planning, implementation, and review by HEAD and developer. HEAD loads this standard for development work, not for every conversation. Project conventions supply concrete repository choices; role instructions supply decision authority.

Coder is separate: the specification author applies this standard before producing the coder's task-specific `context.md`. Coder receives the decided specification, not these design criteria as authority to make further choices.

## 1. Implement Only Required Behavior

- Define scope from the requested behavior and the existing contracts that must remain true.
- Read relevant existing implementations first. Reuse what already provides the needed responsibility and fits this change.
- Treat an observed pattern as a reuse candidate, not proof that it should be repeated. Prefer adopted conventions that fit the requirements and this standard; surface a material conflict rather than copying it or redesigning surrounding code unilaterally.
- Add options, extension machinery, management features, or intermediate state only for a current requirement. Keep unrelated improvements outside the change.

Be able to identify the required behavior or guarantee that would be missing without an addition.

## 2. Separate Necessary Responsibilities

- Separate existing, distinct responsibilities into parts that can be understood and changed independently.
- Make each part's inputs, outputs, and state changes clear. Callers should not need its internal implementation to use it.
- Keep the main processing steps and their order visible in the orchestration code.
- Give business rules a clear owner rather than independently making the same decision in several places.
- A boundary should clarify responsibility or dependency. Do not add a layer that only increases the number of calls without doing either.

Simplicity is not a minimum file count. Separating a responsibility needed now is different from building an abstraction for possible future uses.

## 3. Validate at the Responsible Boundary

- Validate the external input, permission, or business-state condition that the boundary owns.
- Reuse guarantees already established by an earlier boundary, types, contracts, or database constraints. Repeat the same check only when it serves an additional responsibility.
- A separate trust boundary or a state change may require another check; that is not automatically duplication.
- Be able to explain what a check protects and why it belongs at that location.
- Use the established failure boundary. Add fallback, retry, or recovery only when the required failure behavior needs it.

Internal location alone neither requires nor forbids a check. Decide from the actual guarantee and the responsibility of this part.

## 4. Select Verification for the Behavior It Protects

- Exercise a representative real path from authoritative input to the result consumed next.
- Select tests for changed behavior, directly related regressions, and important invariants.
- Use sufficient existing tests or representative execution instead of adding another test for the same assurance.
- Do not create a test for every new function, branch, or helper merely because it exists. Test count and coverage percentage are not goals in themselves.
- Adding no new tests is a valid choice when the necessary behavior is already adequately verified.

The plan specifies the behavior and conditions to verify, including the scope of test creation, modification, and execution. The implementation worker performs that scope without expanding it independently. If an observed fact makes the scope insufficient, return that fact and the missing assurance to the plan owner.

## 5. Design Persistent State by Meaning and Ownership

- Compare a proposed table, column, or stored state with existing data before adding it.
- Distinguish authoritative data from derived values. Store a derived value separately only for a current correctness, history, performance, or other stated requirement.
- Identify who creates and changes the data and when it is removed.
- Make the authority and update responsibility clear so several places do not independently finalize the same fact.
- Splitting a module does not by itself require a table or a data copy. Conversely, do not combine data with different meanings and lifecycles merely to reduce table count.

After the change, a reader should still be able to trace the main flow, its authoritative data, and where state becomes final.

## 6. Plan and Agree on Changed Decisions

Use the existing task record. Include only the detail the change needs:

1. required behavior and what is outside scope;
2. reused implementation, the owner of new behavior, and the main connections;
3. added or changed data, contracts, and dependencies, with their reasons and materially different alternatives;
4. representative execution and selected test scope;
5. decisions the User must make.

Names, function/file decomposition, and internal algorithms inside an agreed boundary belong to the implementation owner. Agree before changing data meaning, external contracts, material ownership boundaries, permissions, charging policy, or material external dependencies. New persistent state requires its need to be made explicit before implementation.

For changes where failure or concurrency can affect amounts, integrity, or permissions, specify the execution order and required atomicity boundary. Keep small changes short; do not invent alternatives, risks, or tests to fill a form.

## 7. Review Against the Same Standard

- Compare claims about existing behavior with the actual code and relevant accepted requirements.
- Check for omitted requirements and unnecessary behavior or state.
- Check that necessary responsibilities are separated and their connections remain legible.
- Check what validation and tests protect and whether their scope is proportionate to the change.
- A review with no findings is a normal result. Do not introduce an independent ideal architecture or a target number of findings.
