import { writeKey, portOf } from '../hosts/antigravity/wake-key.mjs';
import { agyOwner } from '../hosts/antigravity/process.mjs';

function registerWake() {
  const address = process.env.ANTIGRAVITY_LS_ADDRESS;
  const token = process.env.ANTIGRAVITY_CSRF_TOKEN;
  if (!address || token === undefined)
    return 'head-context: 깨우기 등록 안 됨 — agy가 깨울 주소를 넘기지 않았습니다.';
  if (portOf(address) === null)
    return 'head-context: 깨우기 등록 안 됨 — agy가 넘긴 주소를 쓸 수 없습니다.';
  const owner = agyOwner();
  if (!owner.pid || !owner.start)
    return 'head-context: 깨우기 등록 안 됨 — agy 프로세스를 찾지 못했습니다.';
  try { writeKey(owner, { address, token }); } catch (error) {
    return `head-context: 깨우기 등록 안 됨 — 기록을 쓰지 못했습니다(${error.code || error.name}).`;
  }
  return 'head-context: 깨우기 등록됨';
}
console.log(registerWake());
