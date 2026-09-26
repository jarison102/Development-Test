# Payment Checkout — Wompi Sandbox

Prueba técnica full-stack: catálogo → carrito auxiliar → tarjeta y entrega → resumen → pago → resultado → vuelta al catálogo, conservando las cinco etapas originales. El proveedor se usa exclusivamente en **Sandbox/UAT**. El frontend vive en la raíz y el backend NestJS en `backend/`. La extensión multi-producto requiere aplicar manualmente el SQL aditivo en cada base nueva antes de arrancar el backend; en la base local `payment_checkout` se aplicó una sola vez tras respaldo y autorización expresa.

## Arquitectura

```text
React/Vite (raíz)                NestJS + Fastify (backend/)          MySQL (payment_checkout)
──────────────────────────────   ──────────────────────────────────   ─────────────────────────
pages/  ProductPage              controllers  ── HTTP /api ──►        productos
        CartPage, CheckoutPage   application/ (casos de uso)          clientes
        SummaryPage, ResultPage  domain/      (reglas, puertos)       transacciones, transaccion_items
store/  redux slices (memoria)   infrastructure/ (Prisma, Wompi)      entregas
        cartSlice, persistence   common/http  (filtro de errores)     payment_attempts, payment_attempt_items
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

Requisitos: Node 20.6+ (para `--env-file` del seed), MySQL/MariaDB con la base `payment_checkout` ya creada. En una base nueva, antes de ejecutar el backend modificado, revisar y aplicar manualmente `backend/prisma/cart_items.sql` **solo con autorización y respaldo**; no repetirlo en la base local donde ya fue aplicado. Después regenerar Prisma Client con `npm run db:generate`; esto no cambia la BD. No se aplica ningún SQL ni se ejecuta el seed durante instalación/build.

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
- `backend/prisma/payment_attempts.sql` ya fue aplicado una vez a la base local; no repetirlo.
- `backend/prisma/cart_items.sql` se aplicó **una sola vez** en la base local `payment_checkout` tras respaldo y autorización. No repetirlo allí. Crea `transaccion_items` (cantidades y precios unitarios históricos) y `payment_attempt_items` (reservas para productos secundarios); ambas estaban vacías tras su creación. Solo crea tablas/índices/FKs; no elimina columnas ni toca registros existentes. En otras bases revisar el esquema y respaldar antes de aplicarlo manualmente con autorización. Las transacciones anteriores sin detalle siguen usando `producto_id`/`cantidad`.
- El backend compilado con el nuevo Prisma Client necesita estas tablas incluso para consultar órdenes antiguas; antes de crearlas, Prisma respondía `P2021`/HTTP 500 a `GET /transacciones/:id`. Después de aplicarlas, la consulta de solo lectura a la transacción histórica 11 volvió a responder 200. `db:pull` introspectaría el esquema, pero no sustituye la revisión del SQL.

## Seed de productos

Desde `backend/`, `npm run db:seed` ejecuta `prisma/seed.ts` manualmente, después de configurar `backend/.env`. Inserta si falta un producto de demostración por nombre: **Audífonos Pro Demo** (250000.00, 10 unidades), **Teclado Mecánico Demo** (320000.00, 8 unidades) y **Mouse Inalámbrico Demo** (150000.00, 15 unidades). Usa una transacción MySQL con aislamiento `Serializable` (si dos seeds compiten, uno puede fallar y se reintenta manualmente, sin insertar un lote parcial); si detecta cualquier producto ajeno a esta lista, no inserta nada (protección de bases existentes). En una base vacía o con únicamente estos dummies, consulta el nombre antes de insertar cada faltante. No actualiza productos existentes ni modifica stock, precios o estado. No modifica clientes, transacciones, entregas ni intentos de pago. No hay endpoint público para crear productos.

**Nunca ejecutar el seed automáticamente sobre una base existente.** En esta fase no se ejecutó. Revisa el catálogo local y autoriza expresamente cualquier inserción antes de lanzarlo; no presupone que los productos de la base actual tengan esos nombres. El nombre identifica el dummy, pues el esquema existente no tiene clave única de seed para usar `upsert`.

## Modelo de datos

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `productos` | Catálogo | `nombre`, `precio`, `stock`, `activo` |
| `clientes` | Compradores | `nombre`, `correo` (único), `telefono` |
| `transacciones` | Órdenes internas | `referencia` (única), `producto_id` y `cantidad` del primer artículo para compatibilidad, importes, estado (PENDIENTE/APROBADA/RECHAZADA), `id_transaccion_wompi` |
| `transaccion_items` | Detalle de orden nueva; compras antiguas carecen de detalle y usan la cabecera | PK compuesta `(transaccion_id, producto_id)`, FK a orden/producto, `cantidad`, `precio_unitario` y `subtotal` históricos |
| `entregas` | Entregas de compras aprobadas | `transaccion_id`, `cliente_id`, dirección, `estado` (PENDIENTE/EN_PREPARACION/ENVIADA/ENTREGADA) |
| `payment_attempts` | Reserva lógica del primer artículo y dirección para la entrega | `transaccion_id` (PK), `producto_id`, `cantidad`, `estado`, dirección |
| `payment_attempt_items` | Reserva lógica de artículos adicionales; al cerrar el intento se eliminan en cascada | PK `(transaccion_id, producto_id)`; FKs a intento y producto; `cantidad` |

Ninguna tabla guarda PAN, CVC ni tokens de tarjeta.

## Endpoints

Base `http://localhost:3000/api`. Respuestas envueltas en `{ data: ... }`; errores en `{ error: { code, message } }`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/productos` | Catálogo activo |
| GET | `/productos/:id` | Producto por id |
| POST | `/clientes` | Crear cliente |
| POST | `/transacciones/cotizar` | `{items:[{productoId,cantidad}]}` (o antiguo `{productoId,cantidad}`); precios, detalle, tarifas y total calculados en backend |
| POST | `/transacciones` | `{clienteId,items:[{productoId,cantidad}]}` (o contrato antiguo); crea orden `PENDIENTE`, acepta `Idempotency-Key` |
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
ProductPage   → catálogo real, stock y agregar productos
CartPage      → /carrito, cantidades acotadas por stock y subtotal visual; auxiliar al primer paso
CheckoutPage  → cliente + entrega + tarjeta + 2 consentimientos desmarcados
SummaryPage   → detalle y tarifas cotizados en backend; tokeniza y paga
ResultPage    → PENDIENTE/APROBADA/RECHAZADA; consulta estado mientras PENDING
ProductPage   → stock actualizado al volver
```

1. `/carrito` persiste solo `productId`, nombre, precio visual, imagen, stock y cantidad mediante whitelist; el backend ignora esos precios. `POST /api/transacciones/cotizar` vuelve a consultar productos activos, stock y precios, guarda cero datos y cobra una sola tarifa base/envío por orden. `POST /api/transacciones` recalcula el carrito y crea una `PENDIENTE` con referencia `sha256("checkout:" + Idempotency-Key)`; guarda `precio_unitario` por línea y reutiliza la orden solo si cliente y conjunto de artículos coinciden. Si el importe cambia tras cotizar, el frontend exige revisar y confirmar otra vez antes de tokenizar.
2. React mantiene la tarjeta **solo en memoria**; la cifra como JWE (`RSA-OAEP-256`/`A256GCM`, WebCrypto) con la llave pública de tokenización que el backend obtiene de `GET /tokens/keys/tokenization` y expone en `GET /api/payments/terms`. El JWE se envía a `POST /api/payments/tokenize`, que lo reenvía a `POST /tokens/cards` del Sandbox y devuelve solo el `tok_*` (los endpoints de tokenización de Wompi no son legibles desde el navegador por CORS). Nuestros endpoints de negocio nunca reciben PAN/CVC y el JWE no se descifra, persiste ni registra.
3. `POST /api/payments/:id` valida clave, documentos de aceptación vigentes (`GET /merchants/info`), reserva disponibilidad con `SELECT ... FOR UPDATE` + `payment_attempts`, y crea el pago con firma `sha256(referencia + centavos + COP + secreto)` calculada en el backend.
4. `APPROVED` → una única transacción MySQL bloquea productos en orden ascendente, comprueba y descuenta `stock >= cantidad` de cada artículo, crea **una entrega por compra** en `PENDIENTE` y marca `APROBADA`; si falla un artículo, rollback completo. Repetir `APPROVED` no repite descuento ni entrega. `DECLINED`/`VOIDED`/`ERROR` → `RECHAZADA`, sin descuento ni entrega. `PENDING` no liquida nada: `GET /api/payments/:id` consulta al proveedor con llave privada y concilia.
5. Tras refresh se restauran carrito, cliente, entrega, paso, `Idempotency-Key` e id de transacción; **la tarjeta debe reintroducirse**. Al regresar tras un pago aprobado se vacía el carrito. No se han ejecutado pagos multi-producto reales ni validado visualmente todos los tamaños de pantalla.

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
| Frontend | 92.77% | 85.78% | 93.19% | 96.82% |
| Backend | 95.86% | 89.42% | 94.68% | 97.36% |

Cubren con mocks: validación de tarjeta, JWE, firma, contratos HTTP, carrito/persistencia/stock máximo, importes multi-producto, snapshot histórico, idempotencia de contenido, reservas concurrentes con productos compartidos, rollback atómico de descuento, estados PENDING/APPROVED/DECLINED/VOIDED/ERROR y ausencia de tarjeta en almacenamiento. No prueban concurrencia ni pagos sobre la base real.

## Verificación

```bash
npm run lint && npm run build   # raíz y backend/
```

## Deployment

No realizado. Antes de publicar: revisar que `.env` no esté versionado, que el repositorio público no incluya el nombre del proveedor y que no existan llaves reales en Git. Para desplegar la versión Sandbox, preparar BD separada y respaldo, revisar/aplicar SQL aditivo autorizado, configurar variables en gestor de secretos (sin `VITE_` privadas), HTTPS, CORS de orígenes reales, proceso backend gestionado y reconciliación de pagos pendientes. Antes de cualquier uso productivo hacen falta webhooks autenticados, credenciales **distintas** de producción, y manejo de `APPROVED` externo sin descuento local (conciliación/reembolso manual). El SQL aditivo ya se aplicó solo en la base local; no se ha desplegado.

## Decisiones arquitectónicas

- **Reserva lógica (`payment_attempts`) en vez de descontar stock al iniciar el pago**: el stock físico solo se toca tras `APPROVED` confirmado; con concurrencia sobre la última unidad, como máximo una orden puede aprobarse (serialización `FOR UPDATE` + `updateMany` condicionado).
- **Referencia = hash de la Idempotency-Key**: reintentos, doble clic y refresh reutilizan la misma orden sin crear cobros ni entregas duplicadas.
- **Tokenización navegador→backend→Wompi**: los endpoints `/tokens/*` del Sandbox no exponen CORS legible para el navegador (el preflight pasa pero la respuesta real no incluye `Access-Control-Allow-Origin`). Se eligió cifrar el JWE en el navegador y reenviarlo desde el backend, de modo que el PAN nunca llega a un endpoint de negocio y el backend solo maneja ciphertext → `tok_*`.
- **Errores de red ambiguos no reintentan a ciegas**: la reserva queda activa para conciliación manual y evita cargos duplicados.
- **Estado de tarjeta fuera de Redux**: variable de módulo en memoria, borrada tras tokenizar o al abandonar el flujo.
- **Compatibilidad incremental**: se conservan columnas y endpoints antiguos; los detalles nuevos viven en `transaccion_items` y la disponibilidad multi-producto en `payment_attempt_items`. El esquema local ya incluye ambas tablas, pero todavía no se ha creado ni pagado un carrito multi-producto real; las pruebas de escritura y pago permanecen mockeadas.
- **ROP**: bonus no implementado; los use cases conservan excepciones NestJS y puertos existentes para no introducir riesgo artificial en pagos.
