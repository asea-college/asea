# 아세아 이음 · 타이포그래피 기준

## 공식 서체
- 전 플랫폼 기본 서체: **Pretendard(프리텐다드)**. 한국어 사용자 UI에는 한글을 지원하는 **Pretendard**를 사용한다.
- `Pretendard Std`는 라틴어 계열 중심이므로 한국어 본문에는 사용하지 않는다.
- 무료 SIL Open Font License 1.1, 원저작자 Kil Hyung-jin. 원본: https://github.com/orioncactus/pretendard
- 두께: 제목 Bold 700 / 주요 메뉴 SemiBold 600 / 버튼 SemiBold 600 / 본문 Regular 400 / 설명 Medium 500.
- 작은 화면 제목은 20~26sp 범위를 우선하며, 본문은 14~16sp로 균형 잡고 줄간격 1.4~1.5 권장.
- 기존 3번 UI의 파란색 내비게이션과 카드 배치, 데이터 구조는 변경하지 않는다.

## 플랫폼 적용
- 웹: 공식 Pretendard Variable CDN v1.3.9, 시스템 폰트 폴백 포함. 웹 캐시 갱신 필요.
- Android/iOS: Flutter ThemeData fontFamily Pretendard, 앱 빌드 전에 공식 오픈소스 리포지토리의 Regular/Medium/SemiBold/Bold OTF를 받아 앱에 번들링. 오프라인 폰트 렌더링. 폰트 파일은 사용자의 대화에 별도 공유하지 않는다.
- Windows: 기존 실행파일의 서체 교체는 Pretendard가 기기에 설치된 경우만 자동 반영될 수 있으므로, 재배포 및 설치본 글꼴 포함 여부를 검증해야 한다.
- 재빌드 없이 기존 설치 앱에 즉시 적용되지는 않는다.
- 폰트는 직업적 가독성 유지, 과도한 굵기·자간축소는 금지.

## 검증
- Flutter CI font retrieval → flutter pub get → flutter analyze → APK build 순서.
- 한글 줄바꿈, 입력창 커서, 가로폭과 대화 텍스트 넘침을 실제 화면 크기별 검증할 것.
- 바이너리 OTF 파일을 GitHub에 텍스트 콘텐츠로 저장하지 않는다. 원본 라이선스 조건과 출처를 유지한다.
