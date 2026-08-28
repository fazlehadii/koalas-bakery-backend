```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
the values. In production, configure `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `BAKERY_ADMIN_SECRET`, and `FRONTEND_URL` in the
Worker environment. Keep the service-role key and admin secret server-side;
only `NEXT_PUBLIC_API_URL` belongs in the Pages project.

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
