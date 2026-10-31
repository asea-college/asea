# 아세아 이음 웹 공개 배포 상태 및 GitHub 원본 정책 (2026-11-01)

- 기준 원본: GitHub `asea-college/asea`, 브랜치 `feat/notice-foundation`, `apps/portal/{index,community,kindness}.html` 및 `ieum-theme.css`.
- 현 저장소는 **private**(GitHub API 조회). 공개 저장소 전환/운영 코드 전체 공개를 임의 실행하지 않는다.
- GitHub Pages: GitHub Free for organizations에서는 public repo만 가능; private 저장소 Pages는 GitHub Team 등 유료 플랜에서 이용 가능. 조직 플랜 및 Pages 설정은 별도 확인 대상.
- 무료 대체 호스팅으로 Lovable 프로젝트 `a9aa396f-2d2c-422a-93fa-6f40e838cee3` 생성. 해당 프로젝트는 GitHub 원본을 정적 HTML로 복사한 것이므로 장기적으로 GitHub CI 자동 배포 연동 또는 변경 동기화가 필요.
- 2026-11-01 배포 시도: Lovable `deploy_project`는 **OAuth scope projects:write missing**으로 거부됨. 현재 `is_published=false` 상태. 공개 접속 URL **없음**.
- 필요한 사용자 조치: ChatGPT 설정의 Lovable 연결을 **완전히 제거한 후 재설치/재승인**하여 OAuth `projects:write` 허용. 기존 연결의 단순 재연결만으로는 권한이 갱신되지 않는다는 provider 오류 메시지 확인.
- 이 작업에서 공개 페이지의 검증 없이 `*.lovable.app`의 추정 URL을 실서비스 주소로 표시하지 않는다.
- 공개 배포 후 최소 확인: 루트 및 `/community.html`, `/kindness.html` 200 응답, 페이지 간 탐색, 동일 Supabase 프로젝트 로그인, 최고 관리자 및 사용자별 데이터 격리, 콘솔 오류, 모바일 반응형 동작.
- 공개 가능한 소스에는 publishable key만 포함하며 service_role/DB 비밀번호/기타 비밀키를 넣지 않는다.
