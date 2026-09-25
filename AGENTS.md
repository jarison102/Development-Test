# Project workflow

- The React/Vite frontend remains at the repository root; the NestJS API lives in `backend/`. Do not move or duplicate the frontend.
- From `backend/`, use `npm run dev` for local development, `npm run build`, `npm run lint`, and `npm test` for verification.
- `backend/prisma/schema.prisma` was introspected from the existing MySQL/MariaDB `payment_checkout` database. The database is the source of truth; use `npm run db:pull` only for read-only introspection and `npm run db:generate` for Prisma Client. Never reset or recreate the database as part of setup.
- Configure `backend/.env` from `backend/.env.example`; never version `.env` or payment secrets. Backend automated POST tests should use mocks rather than inserting sample records into the existing database; manual end-to-end verification may create a clearly identified test transaction only when explicitly requested by the user.
- Swagger is served at `/api/docs`; the frontend uses `/api/productos`, `/api/productos/:id`, `/api/clientes`, `/api/transacciones/cotizar`, `/api/transacciones`, `/api/transacciones/:id`, and `/api/payments/terms` and `/api/payments/:id`. Payments require Sandbox credentials and the manually reviewed additive `backend/prisma/payment_attempts.sql` before local use; tests mock all Wompi calls.
- From the repository root, run `npm run dev`, `npm run build`, `npm run lint`, and `npm test`. Set `VITE_API_URL` to the local backend `/api` URL at runtime or copy the root `.env.example` to `.env` yourself. Never put a private payment key in a Vite variable.
- Keep automated frontend checkout tests mocked. A manually requested integration check may insert one fictitious customer and PENDIENTE transaction; do not delete existing records or discount stock without an approved payment.
