# OLLDAY Cloudflare 독립 배포본

일반 방문자는 로그인 없이 이용하고, 관리자만 글을 작성·수정·삭제하는 버전입니다. 화면, 관리자 API, 콘텐츠 데이터베이스, 이미지 업로드를 함께 배포합니다. ChatGPT 또는 ChatGPT Sites에 연결하지 않습니다.

기존 GitHub의 Python 서버와 기존 chatgpt.site 사이에 소스 차이가 있어, 현재 공개 사이트에서 확인한 Collection 3건, Magazine 2건, 소식 1건과 해당 공개 이미지를 포함했습니다. 기존 비공개 초안, 업로드 원본 전체, 관리자 비밀번호는 포함되지 않습니다. 기존 서버를 직접 내보낸 원본이 아니라 확인 가능한 공개 상태를 기반으로 구성한 독립 배포본입니다.

## 준비

- Git Bash와 현재 Node.js LTS
- Cloudflare 계정 및 Workers, D1, R2 사용 가능 상태
- R2는 계정에서 별도 활성화가 필요할 수 있습니다. Cloudflare에 표시되는 요금 및 결제 조건을 확인하세요.

압축을 풀어 이 README와 package.json이 있는 폴더에서 명령을 실행합니다.

## 처음 한 번 설정

```bash
npm install
npx wrangler login
npx wrangler d1 create ollday-content --location apac
```

마지막 명령의 결과에 나오는 database_id를 아래 YOUR_DATABASE_ID 대신 붙여넣습니다. 이 ID는 비밀번호가 아닙니다.

```bash
node scripts/configure-d1.mjs YOUR_DATABASE_ID
npx wrangler r2 bucket create ollday-media
npx wrangler d1 migrations apply ollday-content --remote
npx wrangler deploy
node scripts/admin-password.mjs
```

이름이 이미 사용 중이라 생성이 실패하면 기존 리소스가 이 사이트용인지 먼저 확인하세요. 임의의 기존 데이터베이스에 마이그레이션을 적용하지 마세요. 다른 이름을 사용할 때는 wrangler.jsonc와 위 명령의 이름을 함께 바꿉니다.

마지막 명령은 새 관리자 비밀번호를 두 번 입력받아 PBKDF2 해시를 Cloudflare 보안 설정에 저장합니다. 비밀번호는 화면이나 파일에 기록하지 않습니다. Git Bash에서 터미널 입력이 지원되지 않는다는 메시지가 나오면 다음 명령으로 실행합니다.

```bash
winpty node scripts/admin-password.mjs
```

Wrangler가 출력한 실제 workers.dev 주소로 접속합니다. 관리자 주소는 그 주소 뒤에 /admin.html을 붙이면 됩니다. 관리자 비밀번호가 설정되기 전에는 로그인이 차단됩니다. 공개 화면은 먼저 열릴 수 있습니다.

## 관리자 사용

1. /admin.html에서 관리자 비밀번호로 로그인합니다.
2. 새 콘텐츠 작성에서 Collection, Magazine 또는 소식을 선택합니다.
3. 제목과 본문을 입력하고 대표 이미지와 갤러리를 업로드합니다. JPG·PNG·WebP, 파일당 5MB, 갤러리 최대 30장입니다.
4. 초안으로 저장하면 관리자 미리보기에서만 확인할 수 있습니다. 초안에만 사용되는 신규 업로드 이미지도 비로그인 방문자에게 제공하지 않습니다.
5. 공개 상태를 바꾸고 저장하면 방문자 화면에 반영됩니다. 표시 순서는 작은 숫자가 먼저입니다.
6. 다른 창에서 수정한 글을 덮어쓰려고 하면 충돌을 알려줍니다. 작성 중 내용을 복사해 보관한 뒤 목록을 새로고침합니다.
7. 글 삭제는 복원 기능이 없습니다. 업로드 이미지는 글 삭제 후에도 R2에 남습니다.

## 이후 배포와 GitHub 관리

```bash
npx wrangler deploy
```

초기 데이터는 INSERT OR IGNORE로만 가져오며 기존 글을 덮어쓰지 않습니다. 데이터 구조가 바뀌는 업데이트만 새 마이그레이션을 추가해 적용하세요. 비밀번호를 바꾸려면 scripts/admin-password.mjs를 다시 실행합니다. 기존 관리자 세션은 비밀번호 변경 시 무효화됩니다.

이 압축 파일은 GitHub에 자동 업로드하지 않았습니다. 저장소에 반영하려면 사용자가 선택한 저장소의 별도 cloudflare/ 폴더 등에 이 프로젝트를 넣고 커밋할 수 있습니다. node_modules, .wrangler, .dev.vars, .env 및 비밀번호를 커밋하지 않습니다. Wrangler 직접 배포는 GitHub 변경 시 자동 배포를 설정하지 않습니다.

기존 사이트 데이터의 완전한 이전과 기존 주소의 변경은 포함되지 않습니다. 새 사이트 검증 후 기존 사이트 정리는 별도로 진행하세요.

## 구성 및 검증

- public/: 리뉴얼 화면, 관리자 화면, 콘텐츠 목록·상세, 이미지·폰트
- src/worker.js: 공개 콘텐츠 API와 관리자 전용 API
- migrations/: 데이터 구조와 공개 콘텐츠 6건
- reference/public-content.json: 기존 공개 콘텐츠 스냅샷
- scripts/: D1 연결과 관리자 비밀번호 설정
- tests/: 인증, 공개·초안 구분, 수정 충돌, 이미지 접근, 로그아웃, 시도 제한 검사

```bash
npm test
```

Cloudflare 계정에 실제 배포하지 않은 상태입니다. 로컬 테스트는 Node와 SQLite 어댑터로 API 동작을 확인하며 Cloudflare 원격 D1·R2의 운영 환경 검증을 대신하지 않습니다.

Wrangler 4.156.0의 deploy --dry-run으로 Worker 번들과 D1·R2·정적 자산 바인딩 구성을 확인했습니다. 이 검사는 실제 Cloudflare 리소스를 생성하거나 사이트를 배포하지 않습니다. 폰트는 화면 문구와 가져온 콘텐츠를 포함한 서브셋이며, 이후 추가되는 글자는 시스템 글꼴로 표시될 수 있습니다.
