/** Non-active adapter: routing is exclusively through the shared service. */
export function createCandidateHandler(service) {
  if (!service || !["send", "readInbox", "reply", "target"].every((name) => typeof service[name] === "function")) throw new TypeError("A HostAgentCommService is required.");
  return async (name, args = {}, request) => {
    if (Object.hasOwn(args, "self") || Object.hasOwn(request || {}, "self")) throw new Error("Sender identity is host-owned.");
    if (name === "send_message") return service.send(request, args);
    if (name === "read_inbox") return service.readInbox(request, args);
    if (name === "reply_message") return service.reply(request, args);
    if (["register_target", "heartbeat_target", "revoke_target"].includes(name)) return service.target(request, name.replace("_target", ""), args.target);
    throw new Error(`Unknown candidate tool: ${name}`);
  };
}
