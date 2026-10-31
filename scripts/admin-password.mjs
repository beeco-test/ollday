import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if(!process.stdin.isTTY){console.error('관리자 비밀번호는 터미널에서 직접 입력해주세요. Git Bash에서 이 메시지가 나오면 winpty node scripts/admin-password.mjs 명령을 사용하세요.');process.exit(1)}
console.log('새 관리자 비밀번호를 입력합니다. 입력 내용은 화면에 표시하지 않습니다.');
function secret(prompt){return new Promise(resolve=>{process.stdout.write(prompt);let value='';process.stdin.setRawMode(true);process.stdin.resume();const listener=chunk=>{for(const c of chunk.toString()){if(c==='\u0003'){process.stdin.setRawMode(false);process.exit(130)}if(c==='\r'||c==='\n'){process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return}if(c==='\u007f'||c==='\b'){value=value.slice(0,-1)}else if(c>=' ')value+=c}};process.stdin.on('data',listener)})}
const first=await secret('관리자 비밀번호 (12~200자): '),second=await secret('한 번 더 입력: ');
if(first!==second||first.length<12||first.length>200){console.error('비밀번호가 다르거나 길이가 맞지 않습니다.');process.exit(1)}
const salt=randomBytes(16).toString('hex');const hash=pbkdf2Sync(first,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
const record=`pbkdf2-sha256$100000$${salt}$${hash}`;
const command=process.platform==='win32'?'cmd.exe':'npx';
const args=process.platform==='win32'?['/d','/s','/c','npx wrangler secret put ADMIN_PASSWORD_HASH']:['wrangler','secret','put','ADMIN_PASSWORD_HASH'];
const result=spawnSync(command,args,{input:record+'\n',encoding:'utf8',shell:false});
if(result.status!==0){console.error('Cloudflare 비밀번호 저장에 실패했습니다. wrangler login과 Worker 배포 상태를 확인해주세요.');process.exit(1)}
console.log('관리자 비밀번호를 Cloudflare 보안 설정에 저장했습니다. 비밀번호는 파일이나 GitHub에 저장하지 않았습니다.');
