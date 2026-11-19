# ASEA 통합 PC·웹·Android·iOS 개발 현황 — 2026-10-31

## 채택된 디자인과 서버
- UX: 시안 3번, 파란 좌측 메뉴와 날짜별 대화방/메시지 누적.
- 서버: 기존 Supabase `asea-workspace` (Free 유지, 추가 결제 없음).
- 기록: 일반 대화 3년, 공식 공지·업무기록 5년. 자동 삭제 없음.
- 원래 학교 캘린더 저장소/테이블 무변경.

## 이번 작업 중 실제 반영한 구성
- `apps/portal/index.html`: 반응형 웹 메시지함, 이메일 계정 로그인/가입, 승인 대기 안내, 전체·부서·개인 대화방, 전송, 관리자 승인/채널 생성, 개인 메시지 시작.
- `apps/mobile/`: Flutter 공통 Android/iOS 소스. 로그인, 직접 가입 신청, 대화방, 메시지 송수신, 날짜별 기록 UI.
- `server/migrations/20261031_notice_chat_rooms.sql`: 채널/참여자/메시지 모델, 인증·대상별 RLS.
- `server/migrations/20261031_notice_admin_rpc.sql`, `...pending_staff.sql`, `...directory.sql`: 승인·전체 채널 생성·개인 방 개설·직원 목록.
- `server/migrations/20261031_notice_push_devices.sql`: Android/iOS 푸시 토큰 저장 테이블과 사용자별 RLS.
- `.github/workflows/mobile-build.yml`: Android Flutter 자동 분석·debug APK 빌드.
- `.github/workflows/ios-verify.yml`: Apple 비용 승인 뒤 수동 실행하는 iOS simulator 검사 경로.

## 완료 아님 / 필수 후속 개발
- 사용자 요구의 **아이디 + 비밀번호 / 이메일 선택** 방식은 아직 구현되지 않음. 현재 임시 이메일·비밀번호 Auth 경로.
- FCM/APNs 프로젝트 설정·토큰 등록 클라이언트·실제 푸시 전송 기능 및 기기 테스트 미완료.
- iOS signed IPA/TestFlight: Apple Developer 가입, bundle id, 인증서, Xcode 빌드 설정 필요.
- Android 릴리스 APK 서명키 및 업데이트 경로 미확인. debug 아티팩트는 정식 배포 금지.
- 교직원 간 보안 분리·관리자 승인·대화방 생성의 실제 서로 다른 사용자 계정 테스트 부족.
- 웹 포털 운영 배포 미완료. GitHub 조직 Free 비공개 저장소의 Pages 호스팅 제한 때문에 별도 무료 호스팅 또는 요금제 결정 필요.
- 공식 공지/업무기록 전용 UI, 확인 응답 집계, 첨부·검색, PC 실사용 기능 완성/통합 검증 미완료.
- 기존 Windows 설치형 앱은 Flutter 앱과 데이터 모델 통합 및 회귀 검증 필요.

## 비용·보안
- Supabase Free 유지. 새로운 요금제나 Apple 개발자 비용은 사전 승인 없이 진행하지 않음.
- 공개 publishable key만 앱에 사용하고 서비스 비밀키·Apple 서명 인증서·Firebase 비밀키는 저장소에 커밋하지 않음.
- 운영 데이터 삭제/자동 보존 만료 삭제를 수행하지 않음.
- 실서비스 배포 및 PR 병합은 인증/권한/빌드/실기기 검증 성공 후 수행.

## 개발 연속성
- 브랜치: `feat/notice-foundation`, PR #1
- 소스 관리: `asea-college/asea`.
- 변경 내용은 위 마이그레이션과 앱 소스를 검토하여 재현 가능.
