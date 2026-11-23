# Behaviors: Public crawler files (`robots.txt`, `sitemap.xml`)

All scenarios are verified with `unstable_doesMiddlewareMatch` from
`next/experimental/testing/server` against the canonical coarse matcher in
`src/server/__tests__/proxy-matcher.test.ts`.

## Crawler files are public

### `robots.txt` bypasses the proxy

- **Given** the canonical coarse matcher
- **When** the request path is `/robots.txt`
- **Then** the matcher does not match, so a crawler without a session receives the file rather than a redirect to `/login`

### `sitemap.xml` bypasses the proxy

- **Given** the canonical coarse matcher
- **When** the request path is `/sitemap.xml`
- **Then** the matcher does not match

## The exclusion is bounded

### The same file names stay protected outside the site root

- **Given** the canonical coarse matcher
- **When** the request path is `/reports/robots.txt` or `/reports/sitemap.xml`
- **Then** the matcher matches, so the route stays behind the auth check — the lookahead is anchored at the start of the path, so only the well-known locations are public

### Other XML and text resources stay protected

- **Given** the canonical coarse matcher
- **When** the request path is `/api/export.xml` or `/notes.txt`
- **Then** the matcher matches — the fix names two files, it does not exclude the `.xml` and `.txt` extensions

## Documentation stays in sync

### The documented copies carry the updated matcher

- **Given** the matcher literal published in `README.md` and `docs/releases/upgrade-to-0.10.md`
- **When** the test suite runs
- **Then** every documented copy equals the tested literal, so the two new exclusions cannot be present in the test but missing from what consumers copy
