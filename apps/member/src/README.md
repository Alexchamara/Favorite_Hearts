# Member app source layout

```
src/
  main.tsx            entry
  App.tsx             shell / routing (placeholder for now)
  lib/                env, Better-Auth client, api() fetch wrapper, TanStack Query client
  styles/             Tailwind 4 entry + design tokens from the demo
  features/
    auth/             login codes (email or SMS) via Better-Auth, session
    profile/          5-step wizard, profile edit, photos           (Stage 1-2)
    trust/            verification, invitations, takeover, badges    (Stage 2)
    discover/         directory, filters, compare, shortlist         (Stage 3)
    interests/        send / accept / decline / withdraw, connections (Stage 3)
    privacy/          pause, block, report, delete                   (Stage 3)
    membership/       plans, payment proof, expiry                   (Stage 4)
    staff/            owner / backup reviewer workspace              (Stage 2-4)
  components/ui/      Radix-based UI moved from the demo
```

Create a feature folder only when its stage starts. Business rules come from
`docs/OWNER-DECISIONS.md`; the API is the authority and the UI only reflects it.
Server data goes through TanStack Query (`useQuery` / `useMutation` + `api()`); never keep
a second copy of server state in React state. Validate forms with the Zod schemas in `@fh/shared`.
