// node scripts/migrate-0.7.mjs <절대 프로젝트 경로> [--apply]
import path from 'node:path';
import {migrate,describe} from '../core/migrate.mjs';
try{
  const args=process.argv.slice(2),apply=args.includes('--apply'),project=args.find(a=>!a.startsWith('--'));
  if(!project)throw new Error('프로젝트 경로가 필요합니다: node scripts/migrate-0.7.mjs <프로젝트> [--apply]');
  console.log(describe(migrate(path.resolve(project),{apply}),{apply}));
}catch(error){console.error(error.message);process.exitCode=1;}
