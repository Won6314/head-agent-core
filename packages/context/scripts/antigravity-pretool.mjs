import fs from 'node:fs';
import { decide } from '../hosts/antigravity/pretool.mjs';
let answer = { decision: 'allow' };
try {
  answer = decide(JSON.parse(fs.readFileSync(0, 'utf8')));
} catch {}
fs.writeSync(1, `${JSON.stringify(answer)}\n`);
