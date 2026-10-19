import { sessions } from '../../core/sessions.mjs';
import { hostInfo } from './process.mjs';

try {
  const [projectRoot, conversation_id, args = ''] = process.argv.slice(2);
  const [name, branch, ...extra] = args.trim().split(/\s+/);
  if (extra.length) throw new Error('/session <작업 세션> [작업 브랜치 또는 main] 형태로 사용하세요.');
  console.log(sessions(projectRoot, { host: 'claude', hostInfo }).load({ name: name || undefined, branch, conversation_id }));
} catch (error) {
  console.error(`head-context: ${error.message}`);
  process.exitCode = 1;
}
