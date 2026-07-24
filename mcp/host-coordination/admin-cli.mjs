#!/usr/bin/env node
import { createHostAdmin } from "./admin.mjs";
const [command, stateRoot, payload] = process.argv.slice(2);
if (!command || !stateRoot || !["register", "rotate", "inspect"].includes(command)) throw new Error("usage: admin-cli.mjs <register|rotate|inspect> <host-state-root> [json]");
const admin = createHostAdmin({ hostStateRoot: stateRoot });
const input = payload ? JSON.parse(payload) : {};
const value = command === "register" ? admin.register(input) : command === "rotate" ? admin.rotate(input) : admin.inspect();
process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
