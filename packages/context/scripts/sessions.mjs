// Legacy script import surface is a Claude adapter; shared logic lives in core/.
import { sessions as commonSessions } from '../core/sessions.mjs';
export * from '../core/sessions.mjs';
export function sessions(project, options = {}) { return commonSessions(project, { host: 'claude', ...options }); }
