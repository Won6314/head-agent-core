/** Non-active adapter: routing is exclusively through the shared service. */
export function createCandidateHandler(service) {
  if (!service || !["send", "readInbox", "reply"].every((name) => typeof service[name] === "function")) throw new TypeError("A HostAgentCommService is required.");
  return async (name, args = {}, request) => {
    if (Object.hasOwn(args, "self") || Object.hasOwn(request || {}, "self")) throw new Error("Sender identity is host-owned.");
    if (name === "send_message") return service.send(request, args);
    if (name === "read_inbox") return service.readInbox(request, args);
    if (name === "reply_message") return service.reply(request, args);
    throw new Error(`Unknown candidate tool: ${name}`);
  };
}
