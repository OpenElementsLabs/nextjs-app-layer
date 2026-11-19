# Upgrade prompt: `@open-elements/nextjs-app-layer` 0.8.x → 0.9.0

## Prompt

You are upgrading a Next.js app that depends on `@open-elements/nextjs-app-layer` from 0.8.x to 0.9.0. The release fixes a crash of the admin pages in browsers that block site storage and raises the `@open-elements/ui` peer dependency to `^0.11.0`. No exported signature changed. Bump both packages together and verify. Do not change anything outside this scope.

If the app is still on 0.7.x, run [`upgrade-to-0.8.md`](upgrade-to-0.8.md) first.

### What changed in 0.9.0

#### Dependencies

- Bump `@open-elements/nextjs-app-layer` to `0.9.0`.
- **Breaking:** the peer dependency `@open-elements/ui` moved from `^0.10.0` to `^0.11.0`. On `0.x` a caret range does not cross minor versions, so the app must move `@open-elements/ui` to `^0.11.0` in the same change. Follow the library's own guide, [`upgrade-to-0.11.md`](https://github.com/OpenElementsLabs/open-elements-ui/blob/main/docs/upgrade-to-0.11.md), for that part. Its only consumer-visible risk is `react-day-picker` 10 underneath `Calendar`.
- `next`, `next-auth`, `react`, `react-dom` and `lucide-react` did not change. Leave them as they are.

#### Fix: admin pages no longer crash when storage is blocked

`ApiKeysClient`, `WebhooksClient`, `UsersClient` and `AuditLogsClient` read their persisted page size from `localStorage` on first render. In 0.8.x that read was unguarded: in browsers that block site data (LibreWolf, hardened Firefox profiles, `dom.storage.enabled = false`) it threw and the page did not render. In 0.9.0 the read goes through `safeStorage` from `@open-elements/ui` and falls back to the default page size of 20.

Nothing to change in app code. Props, storage keys and the page-size options (10, 20, 50, 100, 200) are unchanged, so a stored page size keeps working.

### Steps

1. In the app's frontend `package.json`, set `@open-elements/nextjs-app-layer` to `0.9.0` and `@open-elements/ui` to `^0.11.0`. Run `pnpm install`.
2. Carry out the steps of the `@open-elements/ui` 0.11 guide linked above.
3. If the app wrapped any of the four admin clients in its own error boundary or `try/catch` only to survive blocked storage, remove that workaround.
4. Run type-check, the test suite and the build. In the running app, open `/admin/api-keys`, `/admin/webhooks`, `/admin/users` and `/admin/audit-logs` and change the page size once.
5. Commit, e.g. `chore(deps): upgrade @open-elements/nextjs-app-layer to 0.9.0`.

### Guard rails

- Do **not** keep `@open-elements/ui` on `0.10.x` and silence the peer warning; the app layer imports `safeStorage`, which 0.10 does not export.
- Do **not** clear or migrate stored page sizes; the keys did not change.
- Do **not** bump `next`, `next-auth`, `react`, `react-dom` or `lucide-react` in the same change.

### Don't do this

- Do not add `react-day-picker` to the app to fix a `Calendar` type error; adjust the props passed to `Calendar` as the ui guide describes.
- Do not bundle this upgrade with unrelated feature work in the same PR.
