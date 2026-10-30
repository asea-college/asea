# ASEA Notice 릴리스 상태 — 2026-10-30

## 실제 반영
- GitHub branch: `feat/notice-foundation`; PR #1 (draft)
- Supabase production project: `asea-workspace` (`zbpeyklwpotjyveipzxd`)
- Migration: `server/migrations/20261030_notice_initial.sql`, 성공적으로 적용됨.
- New tables: `notice_departments`, `notice_profiles`, `notice_announcements`, `notice_responses`.
- All four new tables have RLS enabled; existing calendar tables were not modified.
- Administrator web source: `apps/admin-web/index.html`. Only a basic authenticated authoring flow exists.
- Windows tray prototype: `apps/desktop/`, .NET Framework 4.8, unsigned installer built by GitHub Actions.
- CI run 41014762465: HTML check + Windows compile + Inno installer completed successfully.
- Installer artifact: `asea-notice-windows-unsigned-test` (not approved for employee-wide distribution).

## Incomplete / blocking
- Initial admin and staff provisioning / staff invitation / login-id based onboarding.
- Department-scoped admin and notice routing, scheduled publication server job, full D3 free placement editor.
- Windows saved login token refresh, robust encrypted offline queue, acknowledgment deduplication across restarts, reliable consent/comment UI.
- School calendar data read-only synchronization (currently only opens existing URL).
- Pretendard TTF/logo binary assets not yet bundled in builds.
- Windows 7/10/11 testing on real devices and a trusted code-signing certificate.
- Production admin web hosting and automatic deployment; no public URL has been deployed.
- GitHub PR merging is deferred until functional and security checks are complete.

## Manual checks before production use
1. Provide an appropriately permissioned school administrator Supabase Auth user and a matching approved notice_profiles record using server-side admin provisioning.
2. Add tests for recipient isolation and role escalation.
3. Set up a supported hosting target and CI/CD secrets (never publish service-role key).
4. Sign installer, run real-device and regression checks.
5. Confirm retention and data-protection policies.

## Safety
Do not give the unsigned test installer to 30–50 employees. This is an engineering milestone, not a finished release.
