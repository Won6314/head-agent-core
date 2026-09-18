# HEAD Feature file roles — Core

#### HF-002 — Recover the current HEAD execution context — **Core**

- **defines_behavior:** `packages/head-runtime/shared/session-lifecycle.mjs`
- **implements_behavior:** `packages/head-runtime/shared/session-lifecycle.mjs`; `packages/head-runtime/shared/semantic-run.mjs`
- **configures_behavior:** `packages/head-runtime/claude/session-recovery.mjs`; `packages/head-runtime/shared/context-composition.mjs`
- **provides_context:** `packages/core/docs/TECHNICAL_ARCHITECTURE.md`; `packages/core/docs/FOUNDATIONS.md`; `packages/head-runtime/README.md`
- **provides_evidence:** `packages/head-runtime/shared/session-lifecycle.test.mjs`

#### HF-003 — Start an accepted non-trivial Run — **Core**

- **defines_behavior:** `packages/core/head/HEAD_CORE.md`; `packages/skills/start-job/SKILL.md`; `packages/skills/plan-run/SKILL.md`; `packages/procedures/plan-run/run/initialize-run.md`; `packages/procedures/plan-run/run/activate-run.md`
- **implements_behavior:** `packages/head-runtime/shared/session-transitions.mjs`; `packages/head-runtime/shared/checkpoint-ledger.mjs`
- **configures_behavior:** `packages/head-runtime/opencode/head-session.mjs`
- **provides_context:** `packages/core/docs/TECHNICAL_ARCHITECTURE.md`; `packages/core/docs/FOUNDATIONS.md`

#### HF-005 — Finish a terminal Run — **Core**

- **defines_behavior:** `packages/core/head/HEAD_CORE.md`; `packages/procedures/plan-run/run/finish-run.md`
- **implements_behavior:** `packages/head-runtime/shared/session-transitions.mjs`; `packages/head-runtime/shared/checkpoint-ledger.mjs`
- **configures_behavior:** `packages/head-runtime/opencode/head-session.mjs`

#### HF-006 — Advance a Run checkpoint — **Core**

- **defines_behavior:** `packages/core/head/HEAD_CORE.md`; `packages/procedures/plan-run/run/review-checkpoint.md`
- **implements_behavior:** `packages/head-runtime/shared/checkpoint-ledger.mjs`

#### HF-007 — Continue through context compaction — **Core**

- **defines_behavior:** `packages/core/head/HEAD_CORE.md`
- **implements_behavior:** `packages/head-runtime/opencode/compact-recovery.mjs`; `packages/head-runtime/shared/context-composition.mjs`
- **configures_behavior:** `packages/_platform/project-init/project-initializer.mjs`
- **provides_evidence:** `packages/_platform/project-init/public-entry.test.mjs`
- **ownership note:** Isolated _platform files are unused. The released OpenCode path is independently complete and proven. Project-specific Claude compatibility behavior does not define the Core Feature boundary.

#### HF-008 — Restore a prior HEAD OpenCode session — **Core**

- **defines_behavior:** `packages/core/docs/USER_GUIDE.md`
- **implements_behavior:** `packages/_platform/project-init/resume-session.sh`
- **configures_behavior:** `packages/_platform/project-init/project-initializer.mjs`
- **provides_evidence:** `packages/head-runtime/shared/context-composition.test.mjs`; `packages/_platform/project-init/public-entry.test.mjs`
- **ownership note:** Isolated, unused.

#### HF-012 — Answer a worker authority question — **Core**

- **defines_behavior:** `packages/skills/agent-reply/SKILL.md`; `packages/core/head/HEAD_CORE.md`
- **implements_behavior:** `packages/_platform/coordination/mcp/agent-comm/host-service.mjs`; `packages/_platform/coordination/mcp/agent-comm/candidate-handler.mjs`; `packages/_platform/coordination/mcp/host-coordination/transport.mjs`
- **configures_behavior:** `packages/_platform/project-init/project-initializer.mjs`
- **provides_context:** `packages/core/docs/TECHNICAL_ARCHITECTURE.md`; `packages/core/docs/FOUNDATIONS.md`
- **provides_evidence:** `packages/_platform/coordination/mcp/agent-comm/agent-comm.test.mjs`; `packages/_platform/project-init/public-entry.test.mjs`
- **ownership note:** Isolated, unused.

#### HF-009 — Dispatch an independently ownable worker task — **Core**

- **defines_behavior:** `packages/core/head/HEAD_CORE.md`; `packages/skills/delegate-once/SKILL.md`; `packages/procedures/delegate-once/workers/developer.md`; `packages/skills/plan-run/SKILL.md`; `packages/procedures/plan-run/results/prepare-execution-contract.md`; `packages/procedures/plan-run/results/dispatch-horizon.md`; `packages/procedures/plan-run/workers/coder.md`; `packages/agents/developer/DEVELOPER_CORE.md`; `packages/agents/coder/CODER_CORE.md`
- **implements_behavior:** `packages/_platform/coordination/mcp/agent-task/host-service.mjs`; `packages/_platform/coordination/mcp/agent-task/candidate-handler.mjs`; `packages/_platform/coordination/mcp/host-coordination/transport.mjs`; `packages/_platform/coordination/mcp/host-coordination/worker-launcher.mjs`
- **configures_behavior:** `packages/_platform/project-init/project-initializer.mjs`
- **provides_context:** `packages/core/docs/TECHNICAL_ARCHITECTURE.md`; `packages/core/docs/FOUNDATIONS.md`
- **provides_evidence:** `packages/_platform/coordination/mcp/agent-task/agent-task-execution.test.mjs`; `packages/_platform/project-init/public-entry.test.mjs`
- **ownership note:** Isolated, unused.

#### HF-010 — Integrate a completed worker branch — **Core**

- **defines_behavior:** `packages/core/head/HEAD_CORE.md`; `packages/skills/delegate-once/SKILL.md`; `packages/procedures/plan-run/run/review-checkpoint.md`
- **implements_behavior:** `packages/_platform/coordination/mcp/agent-task/host-service.mjs`; `packages/_platform/coordination/mcp/host-coordination/task-notifier.mjs`
- **provides_context:** `packages/core/docs/TECHNICAL_ARCHITECTURE.md`; `packages/core/docs/FOUNDATIONS.md`
- **provides_evidence:** `packages/_platform/coordination/mcp/agent-task/agent-task-execution.test.mjs`; `packages/_platform/project-init/public-entry.test.mjs`
- **ownership note:** Isolated, unused.

#### HF-055 — Install and initialize a HEAD Core project — **Core**

- **defines_behavior:** `packages/_platform/project-init/README.md`; `README.md`; `release-manifest.json`
- **implements_behavior:** `packages/_platform/project-init/public-entry.mjs`; `packages/_platform/project-init/host-installer.mjs`; `packages/_platform/project-init/project-initializer.mjs`; `packages/_platform/project-init/onboarding-driver.mjs`; `packages/_platform/project-init/head.mjs`
- **provides_context:** `packages/core/docs/USER_GUIDE.md`; `packages/core/docs/TECHNICAL_ARCHITECTURE.md`; `packages/core/docs/FOUNDATIONS.md`
- **provides_evidence:** `packages/_platform/project-init/public-entry.test.mjs`; `packages/_platform/project-init/host-install.test.mjs`; `packages/_platform/project-init/project-initializer.test.mjs`; `packages/_platform/project-init/onboarding-driver.test.mjs`
- **ownership note:** Isolated, unused.
