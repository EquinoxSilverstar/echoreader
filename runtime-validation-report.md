# Runtime Validation Report

**Generated**: 2026-11-18T08:43:11+02:00  
**Target**: EchoReader

## Summary

| Step | Status | Exit Code | Details |
|---|---|---:|---|
| TypeScript | PASS | 0 | `npx tsc --noEmit` |
| Web build | PASS | 0 | `npm run build:web`; Expo exported the GitHub Pages site to `dist` |
| Backend tests | PASS | 0 | `npm test`; 11 passed, 0 failed |
| Browser tests | PASS | 0 | `npm run test:e2e`; 3 passed, 0 failed in Chromium |
| Public bundle scan | PASS | 0 | No direct provider-key variables or provider credential headers found in `dist` |

**Overall**: NEEDS SIGN-OFF — local validation passed; live Firebase and provider integration remain intentionally unconfigured and untested.

## Environment and Verdict

```text
environment:
  docker: UNAVAILABLE — Docker CLI not found
  node: AVAILABLE — v24.19.0 (Functions deployment target: Node.js 22)
  playwright: AVAILABLE — Chromium installed and browser tests passed
  infra-tier: FALLBACK(in-memory mocks) — Firebase Auth, Firestore usage storage, and provider APIs were mocked in backend tests
  browser-tier: PRIMARY(Playwright)
startup: PASS — node e2e/serve-dist.js, ready at http://127.0.0.1:4173/echoreader/
integration: PASS — exit_code: 0, passed: 11, failed: 0, scope: authenticated handler, CORS, provider discovery/synthesis, input and quota errors; gaps: no live Firebase or provider credentials
e2e: PASS — exit_code: 0, passed: 3, failed: 0, flows: guest cloud fallback, device voice selection/switching, play/pause/speed; speech voices were deterministic browser mocks
overall: NEEDS_SIGNOFF — live Firebase deployment, Firestore limits, real browser/device voice audio, and paid provider calls were not enabled or verified
```

## Issues and Gaps

| # | Severity | Description |
|---|---|---|
| 1 | HIGH | `npm audit --omit=dev` reported 29 high and 3 moderate advisories in the existing application production dependency tree. |
| 2 | MEDIUM | The Functions production dependency audit reported 9 moderate advisories. |
| 3 | UNVERIFIED | Firebase ID-token verification, Firestore rate-limit transactions, and real Google/ElevenLabs responses require an approved Firebase deployment and credentials. |
| 4 | UNVERIFIED | Browser tests stubbed Web Speech voices and events; actual system voice availability and audible output need a real browser/device check. |

No Firebase services were enabled, no secrets were configured, and no deployment or GitHub push was performed.
