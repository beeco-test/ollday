import { readFileSync,writeFileSync } from 'node:fs';
const id=process.argv[2];if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')){console.error('D1 생성 결과의 database_id를 전달해주세요.');process.exit(1)}
const file=new URL('../wrangler.jsonc',import.meta.url),config=JSON.parse(readFileSync(file,'utf8'));config.d1_databases[0].database_id=id;writeFileSync(file,JSON.stringify(config,null,2)+'\n');console.log('D1 연결 설정을 반영했습니다.');
