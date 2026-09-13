# Staging environment contract

PulseBuild staging is a production-mode host. This document names configuration only. It does not contain credentials, connection strings, or tenant identifiers.

Deployment happens only after explicit authorization. Phase 5H.1 prepares the repository. It does not create a Vercel project, an Entra application, or a Neon credential change.

## Host

- Approved staging host: **Vercel**
- Runtime: Next.js on Vercel
- Runtime mode on the customer-facing origin: `PULSEBUILD_RUNTIME_MODE=production`
- Harbor Point demo must never run on customer-facing staging
- `VERCEL_ENV=production` and `VERCEL_ENV=preview` cannot run demo mode. Explicit `PULSEBUILD_RUNTIME_MODE=demo` fails closed on those hosted environments at request time.
- Do not use an unprotected Vercel Preview URL as the pilot origin.

## Required environment variable names

Set these on the Vercel staging environment. Values stay in the host secret store. They are never committed.

- `PULSEBUILD_RUNTIME_MODE` — must be `production`
- `DATABASE_URL` — Neon PostgreSQL URL for **application runtime**
- `AUTH_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ID`
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER` — Microsoft Entra tenant issuer URL (`https://login.microsoftonline.com/<tenant>/v2.0`). The tenant value is environment-supplied.
- `AUTH_URL` — HTTPS origin of the staging host, with no path, query, or credentials

Do not add magic-link vendor variables (`RESEND_API_KEY`, SMTP, SendGrid, Postmark, or similar). Magic-link authentication is deferred.

## Microsoft Entra

- Production authentication is Entra-only. The Email/magic-link provider is not registered in production.
- Callback path (register this on the Entra application when it is created):

```
/api/auth/callback/microsoft-entra-id
```

- Full redirect URI is `AUTH_URL` + that path.
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER` pins the approved tenant through environment configuration. Multi-tenant issuers (`common`, `organizations`, `consumers`) are rejected.

## Neon

- Application runtime: use a Neon **pooled** connection string in `DATABASE_URL`. The app opens at most one connection per isolate.
- Migration administration: use a Neon **direct** (non-pooler) URL locally or in an operator shell. Do not put that administrative URL in application environment documentation as a committed value.
- Apply checked-in Drizzle migrations `0000`–`0003` **before** serving traffic (`npm run db:migrate` / `drizzle-kit migrate`).
- Never use `db:push` for pilot deployment.
- Do not rewrite or squash frozen migrations.

## Secrets and local files

- `.env*` files remain untracked (`.gitignore`).
- `.env.local` is for local operator use only.
- Never commit, print, or paste `DATABASE_URL`, `AUTH_SECRET`, Entra secrets, cookies, or session tokens.

## Pilot import size

- PulseBuild pilot import maximum: **4 MB**
- Vercel Function request ceiling: **4.5 MB**
- 4 MB was selected so a valid file plus multipart/form-data overhead stays under the platform request cap
- Next.js `serverActions.bodySizeLimit` is set to admit that 4 MB file plus overhead. It does **not** override Vercel’s 4.5 MB Function limit
- A 4.5 MB file is not supported
- Direct object-storage upload is deferred
- This 4 MB ceiling is a **pilot constraint**, not a claim that the product maximum must remain 4 MB forever

## Deferred and later work

- Magic-link transport: deferred
- `evidence_items` write persistence: deferred
- Operator organization/project membership seeding: Phase 5H.2
- Browser E2E / Playwright: later Phase 5H
- Actual Vercel/Entra/Neon resource creation and deploy: only after explicit authorization
