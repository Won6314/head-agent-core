# agent-comm

`host-service.mjs` provides project-scoped inbox, reply, wait, and delivery operations. `candidate-handler.mjs` adapts the MCP interface to that service.

## Host composition

Register project bindings and route `/agent-comm` through the shared transport. Endpoint initialization derives the caller role and records its exact live Herdr pane as that role's generation-fenced target. Caller identity, target selection, and state paths are host-derived; the only public tools are `send_message`, `read_inbox`, and `reply_message`.
