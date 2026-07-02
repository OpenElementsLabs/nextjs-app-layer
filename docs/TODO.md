# TODO

## Test the OIDC session claim mapping in `auth.ts`

Add tests for the NextAuth `session` callback in `src/server/auth.ts`: the
`roles` claim should be carried through to `session.roles` 1:1, and a missing
claim should yield `[]` (not `undefined`). No auth test file exists today, so
these invariants are unverified.

**Context:** Surfaced during `/spec-review` of spec `001-canonical-role-constants`.
The two "Session claim mapping" behavior scenarios are unchanged by that fix and
were left untested (out of scope for the bug fix). Testing requires extracting
the callback or mocking NextAuth, which is disproportionate for that spec.

**Prerequisite:** None.
