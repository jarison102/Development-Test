# Payment Checkout — Wompi Sandbox

Prueba técnica full-stack: tienda de un solo flujo con checkout de cinco pasos (producto → tarjeta y entrega → resumen → pago → resultado) integrada con **Wompi Sandbox/UAT** exclusivamente. El frontend vive en la raíz del repositorio; el backend NestJS está en `backend/`.

## Arquitectura

```text
React/Vite (raíz)                NestJS + Fastify (backend/)          MySQL (payment_checkout)
──────────────────────────────   ──────────────────────────────────   ─────────────────────────
pages/  ProductPage              controllers  ── HTTP /api ──►        productos
        CheckoutPage             application/ (casos de uso)          clientes
        SummaryPage              domain/      (reglas, puertos)       transacciones
        ResultPage               infrastructure/ (Prisma, Wompi)      entregas
store/  redux slices (memoria)   common/http  (filtro de errores)     payment_attempts
        persistence (localStorage, sin tarjeta)
services/ api.ts, card.ts,
          payments.service.ts (JWE en navegador → proxy backend → Wompi)
```

- Frontend: React 19 + TypeScript + Vite, Redux Toolkit, React Router, Jest + Testing Library, Oxlint.
- Backend: NestJS sobre Fastify, `@nestjs/config`, `@nestjs/swagger`, Prisma Client, `class-validator`, Jest + Oxlint.
- La base de datos `payment_checkout` (MySQL/MariaDB en XAMPP) es la fuente de verdad; el esquema Prisma fue introspectado con `db pull` y la migración de pagos se aplicó como SQL aditivo revisado.

## Instalación

```bash
# Raíz (frontend)
npm install
npm run dev          # http://localhost:5173

# Backend
cd backend
npm install
npm run db:generate  # genera Prisma Client (no toca la base)
npm run dev          # http://localhost:3000
```

Requisitos: Node 20+, MySQL/MariaDB con la base `payment_checkout` ya creada y cargada (productos, cliente y transacción semilla).

## Variables de entorno

Nunca versionar `.env`. Ambos `.env.example` solo contienen placeholders.

Frontend (`.env` en la raíz):

```text
VITE_API_URL="http://localhost:3000/api"
```

Backend (`backend/.env`):

```text
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/payment_checkout"
FRONTEND_ORIGIN="http://localhost:5173,http://127.0.0.1:5173"
PORT=3000
WOMPI_SANDBOX_URL="https://api-sandbox.co.uat.wompi.dev/v1"
WOMPI_PUBLIC_KEY="pub_stagtest_..."        # llave pública del ambiente de prueba
WOMPI_PRIVATE_KEY="prv_stagtest_..."       # nunca en variables VITE_*
WOMPI_INTEGRITY_SECRET="stagtest_integrity_..."
```

Se admiten únicamente parejas URL + credenciales del **mismo** ambiente de prueba: Sandbox público (`https://sandbox.wompi.co/v1`, prefijos `pub_test_`/`prv_test_`/`test_integrity_`) o Sandbox UAT del PDF (`https://api-sandbox.co.uat.wompi.dev/v1`, prefijos `*_stagtest_*`). El adapter rechaza mezclas y cualquier endpoint de producción al procesar pagos; el catálogo puede arrancar sin credenciales de pago.

## Base de datos

- `npm run db:pull` — introspección de solo lectura hacia `schema.prisma`.
- `npm run db:generate` — regenera Prisma Client.
- Nunca `migrate reset` ni `db push`: la base existente es la fuente de verdad.
- `backend/prisma/payment_attempts.sql` es un `CREATE TABLE` aditivo ya aplicado **una sola vez** a `payment_checkout`. No ejecutarlo de nuevo. Crea la tabla vacía con PK `transaccion_id`, índice `(producto_id, estado)` y FKs a `transacciones`/`productos` (`ON UPDATE RESTRICT`); no altera ni borra las cuatro tablas originales.

## Modelo de datos

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `productos` | Catálogo | `nombre`, `precio`, `stock`, `activo` |
| `clientes` | Compradores | `nombre`, `correo` (único), `telefono` |
| `transacciones` | Órdenes internas | `referencia` (única), `cantidad`, `subtotal`, `tarifa_base`, `tarifa_envio`, `total`, `estado` (PENDIENTE/APROBADA/RECHAZADA), `id_transaccion_wompi` |
| `entregas` | Entregas de compras aprobadas | `transaccion_id`, `cliente_id`, dirección, `estado` (PENDIENTE/EN_PREPARACION/ENVIADA/ENTREGADA) |
| `payment_attempts` | Reserva lógica mientras el pago externo está en vuelo | `transaccion_id` (PK), `producto_id`, `cantidad`, `estado`, dirección de entrega |

Ninguna tabla guarda PAN, CVC ni tokens de tarjeta.

## Endpoints

Base `http://localhost:3000/api`. Respuestas envueltas en `{ data: ... }`; errores en `{ error: { code, message } }`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/productos` | Catálogo activo |
| GET | `/productos/:id` | Producto por id |
| POST | `/clientes` | Crear cliente |
| POST | `/transacciones/cotizar` | Cotización server-side (subtotal, tarifa base, envío, total) |
| POST | `/transacciones` | Crear transacción `PENDIENTE`; acepta `Idempotency-Key` |
| GET | `/transacciones/:id` | Consultar transacción |
| POST | `/entregas` | Crear entrega (solo transacción `APROBADA`, una por compra) |
| GET | `/payments/terms` | Documentos de aceptación vigentes + configuración pública Sandbox + llave pública de tokenización |
| POST | `/payments/tokenize` | Reenvía el JWE de tarjeta a Wompi y devuelve solo el `tok_*`; no descifra ni persiste |
| POST | `/payments/:id` | Procesar pago; **exige** `Idempotency-Key` de la orden |
| GET | `/payments/:id` | Verificar estado del pago contra el proveedor; **exige** `Idempotency-Key` |

## Swagger

Documentación interactiva en `http://localhost:3000/api/docs`.

## Flujo de checkout

```text
ProductPage   → lista catálogo real, selecciona producto y cantidad
CheckoutPage  → cliente + entrega + tarjeta + 2 consentimientos desmarcados
SummaryPage   → cotización del backend; tokeniza la tarjeta y paga
ResultPage    → PENDIENTE/APROBADA/RECHAZADA con polling mientras PENDING
ProductPage   → stock actualizado al volver
```

1. `POST /api/transacciones` crea una `PENDIENTE` con referencia `sha256("checkout:" + Idempotency-Key)`; reintentos con la misma clave devuelven la misma orden.
2. React mantiene la tarjeta **solo en memoria**; la cifra como JWE (`RSA-OAEP-256`/`A256GCM`, WebCrypto) con la llave pública de tokenización que el backend obtiene de `GET /tokens/keys/tokenization` y expone en `GET /api/payments/terms`. El JWE se envía a `POST /api/payments/tokenize`, que lo reenvía a `POST /tokens/cards` del Sandbox y devuelve solo el `tok_*` (los endpoints de tokenización de Wompi no son legibles desde el navegador por CORS). Nuestros endpoints de negocio nunca reciben PAN/CVC y el JWE no se descifra, persiste ni registra.
3. `POST /api/payments/:id` valida clave, documentos de aceptación vigentes (`GET /merchants/info`), reserva disponibilidad con `SELECT ... FOR UPDATE` + `payment_attempts`, y crea el pago con firma `sha256(referencia + centavos + COP + secreto)` calculada en el backend.
4. `APPROVED` → una transacción de base de datos descuenta stock (`stock >= cantidad`), marca `APROBADA` y crea una entrega `PENDIENTE` una sola vez. `DECLINED`/`VOIDED`/`ERROR` → `RECHAZADA`, sin descuento ni entrega. `PENDING` no liquida nada: `GET /api/payments/:id` consulta al proveedor con llave privada y concilia.
5. Tras refresh se restauran producto, cliente, entrega, paso, `Idempotency-Key` e id de transacción; **la tarjeta debe reintroducirse**.

## Integración Sandbox

- URL/llaves validadas como pareja por ambiente; producción y mezclas se rechazan.
- Tokenización: JWE cifrado en el navegador, reenviado por el backend a Wompi; el navegador solo recibe el `tok_*` y el backend nunca ve PAN/CVC.
- Los tokens de aceptación se obtienen en cada pago con `GET /merchants/info`; no se exponen al frontend ni se persisten.
- Tarjetas oficiales de prueba: `4242 4242 4242 4242` (aprobada), `4111 1111 1111 1111` (rechazada); verificación real ejecutada: DECLINED dejó stock 10→10 sin entrega; APPROVED dejó stock 10→9 con una entrega `PENDIENTE` e id externo registrado.
- Diferencias con el PDF (oct 2025): el PDF usa URLs/credenciales UAT compartidas; la documentación vigente recomienda JWE, usa `/merchants/info` (el endpoint `/merchants/:publicKey` será retirado) y exige consultar transacciones externas desde el backend con llave privada. Las credenciales del PDF solo se configuran manualmente en `backend/.env`, nunca en código, docs ni tests.
- Fuentes oficiales: [ambientes](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/), [tarjetas/tokenización](https://docs.wompi.co/docs/colombia/metodos-de-pago/), [aceptación](https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/), [transacciones](https://docs.wompi.co/docs/colombia/transacciones/), [firma](https://docs.wompi.co/docs/colombia/widget-checkout-web/), [fuentes de pago](https://docs.wompi.co/docs/colombia/fuentes-de-pago/), [tarjetas de Sandbox](https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/).

## Seguridad

- La llave privada y el secreto de integridad **solo** existen en `backend/.env` (ignorado por Git) y nunca salen del backend.
- Nada de tarjeta en MySQL, Redux persistido ni `localStorage`; el payload de pago nunca contiene `number`/`cvc` (verificado en tests).
- Logs del backend limitados a `transactionId`, `reference`, `externalTransactionId` y `status` — sin PAN, CVC, llaves, tokens ni encabezados `Authorization`.
- `Idempotency-Key` v4 obligatoria en operaciones de pago; la referencia derivada impide pagar/consultar órdenes ajenas.
- DTOs con `class-validator` (`whitelist`, `forbidNonWhitelisted`); el cliente no puede enviar importes — siempre se calculan en el backend.

## Tests y coverage

```bash
npm test -- --coverage          # frontend (jsdom, sin red)
cd backend && npm test -- --coverage
```

Todo es con mocks: sin Internet, sin escrituras en MySQL, sin pagos reales.

| Proyecto | Stmts | Branches | Funcs | Lines |
|---|---|---|---|---|
| Frontend | 93.15% | 85.58% | 94.01% | 97.71% |
| Backend | 96.75% | 91.92% | 92.42% | 98.05% |

Cubren: validación de tarjeta (Luhn/fechas/CVC/cuotas), tokenización JWE, firma de integridad, parejas URL/llaves por ambiente, contratos HTTP, idempotencia, reserva concurrente con stock 1, transiciones PENDING→APPROVED/DECLINED/VOIDED/ERROR, errores del proveedor, refresh/recuperación y ausencia de datos sensibles persistidos.

## Verificación

```bash
npm run lint && npm run build   # raíz y backend/
```

## Deployment

No realizado (fuera del alcance de esta fase). Antes de cualquier despliegue productivo hace falta: webhooks autenticados del proveedor para conciliar pagos sin consulta activa, HTTPS, CORS de orígenes reales, credenciales de producción en un gestor de secretos y manejo del caso "APPROVED externo sin descuento local" (conciliación/reembolso manual).

## Decisiones arquitectónicas

- **Reserva lógica (`payment_attempts`) en vez de descontar stock al iniciar el pago**: el stock físico solo se toca tras `APPROVED` confirmado; con concurrencia sobre la última unidad, como máximo una orden puede aprobarse (serialización `FOR UPDATE` + `updateMany` condicionado).
- **Referencia = hash de la Idempotency-Key**: reintentos, doble clic y refresh reutilizan la misma orden sin crear cobros ni entregas duplicadas.
- **Tokenización navegador→backend→Wompi**: los endpoints `/tokens/*` del Sandbox no exponen CORS legible para el navegador (el preflight pasa pero la respuesta real no incluye `Access-Control-Allow-Origin`). Se eligió cifrar el JWE en el navegador y reenviarlo desde el backend, de modo que el PAN nunca llega a un endpoint de negocio y el backend solo maneja ciphertext → `tok_*`.
- **Errores de red ambiguos no reintentan a ciegas**: la reserva queda activa para conciliación manual y evita cargos duplicados.
- **Estado de tarjeta fuera de Redux**: variable de módulo en memoria, borrada tras tokenizar o al abandonar el flujo.
