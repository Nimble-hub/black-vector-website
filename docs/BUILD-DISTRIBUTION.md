# Private build distribution

Black Vector game builds are stored in the private R2 bucket
`black-vector-game-builds`. The bucket has no public development URL or custom
domain. Downloads are streamed only through the authenticated Worker route.

## Release flow

1. Package the Windows build as a single archive and calculate its SHA-256.
2. Upload it from the development PC under a versioned key:

   ```powershell
   npx wrangler r2 object put "black-vector-game-builds/builds/playtest/0.1.0/Black-Vector-Playtest-0.1.0.zip" --file="F:\path\to\Black-Vector-Playtest-0.1.0.zip" --content-type="application/zip" --remote
   ```

3. While signed in as a Black Vector administrator, publish the uploaded object
   through `POST /api/downloads/admin/release`. The JSON body accepts
   `objectKey`, `version`, `filename`, `sha256`, `releaseNotes`, and `publish`.
   Publishing automatically retires the previous build for that channel and
   platform.
4. Grant or revoke an account through
   `POST /api/downloads/admin/entitlement` using either its `userId` or verified
   `email`, plus `active` and an optional ISO `expiresAt` value.

Until a published database record points to an R2 object with the exact stored
size, `/api/downloads/status` reports `offline` and the public terminal remains
disabled.

## Delivery guarantees

- `/api/downloads/current` requires an authenticated account, verified email,
  and active entitlement. Administrators retain diagnostic access.
- R2 bodies are streamed directly; the Worker never buffers the game archive.
- `GET`, `HEAD`, and byte ranges are supported so browsers and download
  managers can resume interrupted transfers.
- Responses are attachment-only, private, non-cacheable, and include ETag,
  content length, and the configured SHA-256 value.
