# ASEA Notice Windows client

Target design: Windows 7 SP1 / 10 / 11. This is a work-in-progress client. **Do not distribute to employees yet.**

The workflow `.github/workflows/notice-build.yml` will compile a Windows artifact once source is added and validated. An artifact from CI is not the same as a signed installer or proven Windows 7 compatibility.

Required: tray login/logout, DPAPI-protected session, periodic refresh, RLS-constrained notice list, mandatory acknowledgement with deduplicated queue, calendar link, verified signed updates.

Current blocking tasks: code-signing identity; real Windows 7/10/11 testing; production deployment and update hosting.
