import path from 'node:path';
import {sessions} from '../core/sessions.mjs';
try {
  const [project,name,limit='30',branch]=process.argv.slice(2);
  console.log(sessions(path.resolve(project)).inspect({action:'map',name,limit:Number(limit),branch}));
}catch(error){console.error(error.message);process.exitCode=1;}
