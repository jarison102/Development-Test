# Payment Checkout — Wompi Sandbox

Prueba técnica full-stack: catálogo → carrito auxiliar → tarjeta y entrega → resumen → pago → resultado → vuelta al catálogo. El proveedor de pagos se usa exclusivamente en **Sandbox/UAT**. El frontend React vive en la raíz y el backend NestJS en `backend/`. El despliegue público utiliza Vercel para la web y Railway para la API; según la información proporcionada por el responsable, la base MySQL/MariaDB del despliegue está en Railway. XAMPP se utilizó únicamente durante el desarrollo local. Las extensiones del esquema requieren revisión y aplicación manual del SQL aditivo en cada base nueva; nunca se ejecutan durante el build.

## Arquitectura

```text
Vercel: React SPA + Vite + Redux (raíz)
  └── HTTPS /api → Railway: NestJS + Fastify (backend/)
                          ├── Controller → Application / Use Case → Ports → Adapters
                          │                              ├── Prisma → Railway MySQL/MariaDB
                          │                              └── SandboxPaymentAdapter → Wompi Sandbox
                          └── Swagger /api/docs
```

- Frontend: React 19 + TypeScript + Vite, Redux Toolkit, React Router, Jest + Testing Library y CSS mobile-first con Flexbox/Grid. `src/store/persistence.ts` restaura carrito y progreso en `localStorage`; la tarjeta solo vive en memoria (`src/services/card.ts`).
- Backend: NestJS sobre Fastify, `@nestjs/config`, `@nestjs/swagger`, Prisma Client, `class-validator`, Jest y Oxlint. Las rutas viven en `backend/src/*/*.controller.ts`; las reglas están en `application/` y `domain/`; las interfaces (`domain/*.port.ts`, `payments/ports/`) desacoplan los adaptadores Prisma/Wompi registrados por los módulos NestJS. `PaymentsUseCases` depende de `PaymentGatewayPort` y `PaymentOrdersPort`, no de la implementación del proveedor.
- MySQL/MariaDB: el esquema en `backend/prisma/schema.prisma` fue introspectado de la base existente. En el despliegue la base está en Railway (información del responsable del proyecto); XAMPP fue solo para desarrollo. La respuesta pública de `GET /api/productos` comprueba acceso a datos desde la API, pero no revela el host de la BD ni sustituye verificarlo en el panel de Railway.
- **ROP en aplicación/dominio:** `backend/src/common/result/result.ts` define `Result<T, E>`, `ok`/`err`, `map`, `andThenAsync` y `combine`; `app-error.ts` tipa errores por `kind`. Catálogo, clientes, cotización, creación/consulta de transacciones, cálculo de importes, entregas y pagos devuelven `Result` en vez de lanzar errores de negocio. `backend/src/common/http/result-to-http.ts` convierte errores a excepciones NestJS solo en el borde HTTP; el filtro global conserva códigos, mensajes y formato anteriores. Los puertos/adaptadores Prisma y Wompi siguen basados en promesas.

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

**Solo nombres de variables y URLs públicas; nunca valores privados ni credenciales en este documento.** Configurar variables de producción en los gestores de Vercel y Railway, no mediante `.env` versionados. Los `.env.example` contienen únicamente placeholders locales.

| Entorno | Variable | Uso |
|---|---|---|
| Vercel (frontend) | `VITE_API_URL` | URL pública HTTPS de la API Railway con sufijo `/api`; la versión pública verificada apunta a `https://backend-production-ca58.up.railway.app/api`, no a localhost. Al cambiar la variable en Vercel se requiere un nuevo build para reflejarla en el bundle. |
| Railway (backend) | `DATABASE_URL` | Conexión privada MySQL/MariaDB de Railway; nunca en variables `VITE_*`. |
| Railway (backend) | `FRONTEND_ORIGIN` | Origen HTTPS exacto del frontend Vercel, sin ruta; la respuesta pública CORS permite ese origen. |
| Railway (backend) | `PORT`, `HOST` | Puerto asignado por la plataforma y host de escucha (opcional). |
| Railway (backend) | `WOMPI_SANDBOX_URL`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET` | Ambiente y credenciales Sandbox del mismo entorno; las privadas permanecen en el backend. |

En desarrollo local se pueden copiar los archivos `.env.example` y configurar las variables con valores **locales**. El adapter valida las parejas URL/llaves de Sandbox y rechaza combinaciones con producción. No reutilizar los ejemplos locales como configuración del deploy.

## Base de datos

- `npm run db:pull` — introspección de solo lectura hacia `schema.prisma`.
- `npm run db:generate` — regenera Prisma Client.
- Nunca `migrate reset` ni `db push`: la base existente es la fuente de verdad.
- `backend/prisma/payment_attempts.sql` y `backend/prisma/cart_items.sql` son aditivos. En desarrollo se aplicaron una sola vez a la base **local** `payment_checkout` tras respaldo y autorización; no repetirlos allí. El segundo crea `transaccion_items` (precios históricos) y `payment_attempt_items` (reservas de artículos adicionales). Antes de aplicarlos a otra base, comparar su esquema real y obtener respaldo/autorización; esta auditoría no ejecutó SQL ni confirmó desde el panel si están aplicados en Railway.
- El backend compilado con el nuevo Prisma Client necesita estas tablas incluso para consultar órdenes antiguas; en desarrollo, antes de crearlas, Prisma devolvía `P2021`/HTTP 500 a `GET /transacciones/:id` y después la consulta histórica volvió a responder 200. La API Railway respondió 200 a `GET /api/productos`, lo que no comprueba por sí solo todas las tablas de pagos. `db:pull` introspecta, pero no sustituye la revisión del SQL.

## Seed de productos

Desde `backend/`, `npm run db:seed` ejecuta `prisma/seed.ts` manualmente, después de configurar `backend/.env`. Inserta si falta un producto de demostración por nombre: **Audífonos Pro Demo** (250000.00, 10 unidades), **Teclado Mecánico Demo** (320000.00, 8 unidades) y **Mouse Inalámbrico Demo** (150000.00, 15 unidades). Usa una transacción MySQL con aislamiento `Serializable` (si dos seeds compiten, uno puede fallar y se reintenta manualmente, sin insertar un lote parcial); si detecta cualquier producto ajeno a esta lista, no inserta nada (protección de bases existentes). En una base vacía o con únicamente estos dummies, consulta el nombre antes de insertar cada faltante. No actualiza productos existentes ni modifica stock, precios o estado. No modifica clientes, transacciones, entregas ni intentos de pago. No hay endpoint público para crear productos.

**No ejecutar el seed en producción ni automáticamente.** En esta auditoría no se ejecutó. Solo con autorización y tras revisar la base destino, desde `backend/` ejecutar `npm run db:seed`. Es repetible por nombre si la base está vacía o contiene únicamente esos dummies; si existen productos ajenos, no inserta nada. El nombre identifica cada dummy porque el esquema no tiene clave única de seed para usar `upsert`.

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

Base pública: `https://backend-production-ca58.up.railway.app/api` (Railway, HTTPS). Para desarrollo local, el backend expone `/api` en el puerto configurado. Respuestas en `{ data: ... }`; errores en `{ error: { code, message } }`. Solo se consultaron públicamente rutas GET y un preflight OPTIONS; no se enviaron peticiones de pago.

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

Swagger público: https://backend-production-ca58.up.railway.app/api/docs (GET 200 durante esta auditoría). Localmente se encuentra en `/api/docs` sobre el host/puerto del backend (`cd backend && npm run dev`).

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
- **Pruebas Sandbox ejecutadas anteriormente y registradas en el proyecto (no repetidas en esta auditoría):** `DECLINED`: stock **10 → 10**, sin entrega; `APPROVED`: stock **10 → 9**, entrega creada en estado `PENDIENTE` e identificador externo registrado. Esta auditoría no realizó pagos adicionales ni alteró stock.
- `PENDING`: conserva la orden pendiente sin descontar stock ni crear entrega; una consulta posterior permite conciliar. Las pruebas unitarias con mocks cubren los tres estados, idempotencia/reintentos, concurrencia y reserva lógica, tokenización JWE y persistencia segura sin PAN/CVC.
- Diferencias con el PDF (oct 2025): el PDF usa URLs/credenciales UAT compartidas; la documentación vigente recomienda JWE, usa `/merchants/info` (el endpoint `/merchants/:publicKey` será retirado) y exige consultar transacciones externas desde el backend con llave privada. Las credenciales de prueba deben configurarse manualmente en el gestor privado de Railway o, solo para desarrollo local, en `backend/.env` ignorado por Git; nunca en código, documentación ni tests.
- Fuentes oficiales: [ambientes](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/), [tarjetas/tokenización](https://docs.wompi.co/docs/colombia/metodos-de-pago/), [aceptación](https://docs.wompi.co/docs/colombia/tokens-de-aceptacion/), [transacciones](https://docs.wompi.co/docs/colombia/transacciones/), [firma](https://docs.wompi.co/docs/colombia/widget-checkout-web/), [fuentes de pago](https://docs.wompi.co/docs/colombia/fuentes-de-pago/), [tarjetas de Sandbox](https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/).

## Seguridad

- La llave privada y el secreto de integridad deben permanecer únicamente en el entorno del **backend Railway**; nunca en Vercel, variables `VITE_*`, tests ni documentación. No se consultaron ni mostraron valores privados.
- **Hallazgo crítico pendiente antes de entregar el repositorio público:** `backend/.env` estaba rastreado en Git y su ruta todavía es accesible en un commit histórico **público** de GitHub (comprobación de estado HTTP sin descargar ni mostrar contenido). Se quitó del índice local con `git rm --cached backend/.env` (archivo local conservado, protegido por `.gitignore`), **sin reescribir historial ni hacer push**. **Revocar/rotar las credenciales afectadas y actualizar las variables de Railway mediante un canal seguro es obligatorio antes de compartir la entrega**; desindexar no borra los commits anteriores. Evaluar limpieza del historial únicamente con autorización específica. `.env` de la raíz no está rastreado. Los `.env.example` usan placeholders.
- Revisión de patrones de llaves privadas, secretos de integridad y bloques de clave privada en código, tests y documentación: sin coincidencias de valores reales detectadas; esta búsqueda no sustituye la revisión del historial ni la rotación.
- Nada de tarjeta en MySQL, Redux persistido ni `localStorage`; el payload de pago nunca contiene `number`/`cvc` (verificado en tests). Los logs del caso de uso de pagos se limitan a identificadores y estado, no a tarjeta o llaves.
- `Idempotency-Key` v4 obligatoria en operaciones de pago; la referencia derivada impide pagar/consultar órdenes ajenas. DTOs con `class-validator` (`whitelist`, `forbidNonWhitelisted`); los importes se calculan en el backend.

## Tests y coverage

```bash
npm test -- --coverage          # frontend (jsdom, sin red)
cd backend && npm test -- --coverage
```

Las suites automatizadas utilizan mocks: sin escrituras en MySQL ni pagos reales. Ejecución actual: **102 tests frontend** y **128 tests backend**, todos aprobados. Las consultas GET/OPTIONS de la auditoría de deployment se realizaron por separado; no se repitieron pagos Sandbox. La suite frontend imprime avisos React `act(...)` no fatales.

| Proyecto | Stmts | Branches | Funcs | Lines |
|---|---|---|---|---|
| Frontend | 93.53% | 87.89% | 94.84% | 97.38% |
| Backend | 95.17% | 86.16% | 96.57% | 97.79% |

Cubren con mocks: validación de tarjeta, JWE, firma, contratos HTTP, carrito/persistencia/stock máximo, importes multi-producto, snapshot histórico, idempotencia de contenido, reservas concurrentes con productos compartidos, rollback atómico de descuento, estados PENDING/APPROVED/DECLINED/VOIDED/ERROR y ausencia de tarjeta en almacenamiento. No prueban concurrencia ni pagos sobre la base real.

## Verificación

```bash
# Desde la raíz: frontend
npm run lint && npm run build && npm test -- --coverage
# Desde backend/: API (no ejecuta el seed ni modifica la BD)
cd backend
npm run lint && npm run build && npm test -- --coverage
```

## Deployment

Despliegue en funcionamiento (verificación de solo lectura; sin redeploy ni pagos):

```text
Vercel — React SPA
    ↓ HTTPS /api (CORS para origen Vercel)
Railway — NestJS + Fastify
    ↓ DATABASE_URL privada
Railway — MySQL/MariaDB (ubicación informada por el responsable del proyecto)
```

| Componente | Proveedor | Dirección / verificación |
|---|---|---|
| Frontend | Vercel | https://development-test-ebon.vercel.app/productos — HTML SPA público por HTTPS. |
| Backend/API | Railway | https://backend-production-ca58.up.railway.app/api — esta URL está incorporada en el bundle público de Vercel; `GET /api/productos` respondió **200** con 20 productos. La versión pública **no usa la URL local** de `VITE_API_URL` del entorno de desarrollo. |
| Swagger | Railway | https://backend-production-ca58.up.railway.app/api/docs — `GET` respondió **200** por HTTPS. |
| Base de datos | Railway (según configuración reportada) | La lectura del catálogo desde la API responde 200, señal de conexión a una fuente de datos. Sin acceso al panel de Railway no se comprobó directamente host, variables privadas, backups ni aplicación del SQL aditivo en la base cloud. |
| GitHub | Repositorio público | https://github.com/jarison102/Development-Test — HTTP 200; el **nombre del repositorio** no contiene el nombre del proveedor de pagos. |

Se probó `Origin: https://development-test-ebon.vercel.app` en `GET /api/productos` y `/api/docs`: `Access-Control-Allow-Origin` devuelve ese origen; preflight `OPTIONS /api/transacciones/cotizar` devolvió **204** y permite GET/POST/OPTIONS. No se consultó `GET /api/payments/terms` porque puede devolver material público de tokenización no necesario para esta auditoría. Las variables necesarias aparecen **solo por nombre** en «Variables de entorno». La `.env` local puede apuntar a localhost sin afectar el bundle desplegado; producción debe conservar `VITE_API_URL` apuntando a Railway y `FRONTEND_ORIGIN` al origen Vercel. La configuración privada de Railway y la ubicación física de su BD requieren confirmación en el panel.

**Bloqueo de seguridad antes de compartir el enlace final:** un commit público histórico sigue exponiendo la ruta `backend/.env`. Revocar/rotar las credenciales asociadas y confirmar los cambios de Railway antes de entregar (véase «Seguridad»). Este despliegue es Sandbox: no utilizarlo para pagos reales; un uso productivo exigiría controles adicionales (p. ej., webhooks autenticados y respuesta ante una aprobación externa sin liquidación local).

## Decisiones arquitectónicas

- **Reserva lógica (`payment_attempts`) en vez de descontar stock al iniciar el pago**: el stock físico solo se toca tras `APPROVED` confirmado; con concurrencia sobre la última unidad, como máximo una orden puede aprobarse (serialización `FOR UPDATE` + `updateMany` condicionado).
- **Referencia = hash de la Idempotency-Key**: reintentos, doble clic y refresh reutilizan la misma orden sin crear cobros ni entregas duplicadas.
- **Tokenización navegador→backend→Wompi**: los endpoints `/tokens/*` del Sandbox no exponen CORS legible para el navegador (el preflight pasa pero la respuesta real no incluye `Access-Control-Allow-Origin`). Se eligió cifrar el JWE en el navegador y reenviarlo desde el backend, de modo que el PAN nunca llega a un endpoint de negocio y el backend solo maneja ciphertext → `tok_*`.
- **Errores de red ambiguos no reintentan a ciegas**: la reserva queda activa para conciliación manual y evita cargos duplicados.
- **Estado de tarjeta fuera de Redux**: variable de módulo en memoria, borrada tras tokenizar o al abandonar el flujo.
- **Compatibilidad incremental**: se conservan columnas y endpoints antiguos; los detalles nuevos viven en `transaccion_items` y la disponibilidad multi-producto en `payment_attempt_items`. El esquema local ya incluye ambas tablas, pero todavía no se ha creado ni pagado un carrito multi-producto real; las pruebas de escritura y pago permanecen mockeadas.
- **Hexagonal / Ports & Adapters: implementado.** `TransaccionesController` → `CotizarTransaccion`/`CrearTransaccion` → puertos `ProductosPort`/`ClientesPort`/`TransaccionesPort` → repositorios Prisma; `PaymentsController` → `PaymentsUseCases` → `PaymentGatewayPort`/`PaymentOrdersPort` → `SandboxPaymentAdapter`/`PrismaPaymentOrdersRepository` (registrados en `PaymentsModule`). Reserva, liquidación de stock y entrega automática aprobada están en el adaptador de órdenes; `CrearEntrega` usa puertos para la ruta independiente de entregas. El proveedor no está importado directamente por el caso de uso.
- **ROP: implementado en aplicación/dominio sin cambiar el contrato HTTP.** `backend/src/common/result/result.ts` y `app-error.ts` modelan éxito/error como valores; `backend/src/common/http/result-to-http.ts` traduce al mismo HTTP previo en los controllers. `CotizarTransaccion`, `CrearTransaccion`, `PaymentsUseCases` y `CrearEntrega` encadenan resultados; las excepciones de puertos se capturan en el límite `fromPromise` sin descartarlas. En pagos, `andThenAsync` recorre: validar `Idempotency-Key` → buscar orden → verificar documentos vigentes → reservar → crear pago externo con **token ya obtenido** → asociar identificador externo → conciliar (`PENDING` sin liquidación, `APPROVED`/`DECLINED`/`ERROR` mediante `settle`). La tokenización JWE es un endpoint separado (`/api/payments/tokenize`), no se repite dentro de `pay`. Prisma `settle` conserva su transacción atómica de stock y entrega; `DECLINED` sigue retornando estado `RECHAZADA` en una respuesta exitosa, no HTTP 402.

## Cumplimiento frente al documento de la prueba

| Requisito | Estado | Evidencia | Pendiente |
|---|---|---|---|
| React SPA | ✅ Cumple | React/Vite + `src/routes/AppRoutes.tsx`; Vercel responde SPA. | — |
| Redux / Flux | ✅ Cumple | Redux Toolkit en `src/store/`. | — |
| Mobile-first | ✅ Cumple | CSS base desde 320 px, media queries a 700/1000 px. | Validación visual manual en dispositivos reales no realizada en esta auditoría. |
| Responsive | ✅ Cumple | Grid adaptable y controles flexibles en `src/index.css`. | Verificación visual multinavegador pendiente. |
| Flexbox / Grid | ✅ Cumple | `.product-grid`, `.form-grid`, `.header-content`, `.page-actions`. | — |
| Persistencia tras refresh | ✅ Cumple | `src/store/persistence.ts` restaura progreso, no tarjeta; tests frontend. | — |
| NestJS | ✅ Cumple | `backend/src/app.module.ts`, controladores y Fastify. | — |
| TypeScript | ✅ Cumple | Código fuente y build `tsc`/Nest exitosos. | — |
| Lógica separada de controllers | ✅ Cumple | Casos de uso en `application/`, reglas en `domain/`. | — |
| Hexagonal / Ports & Adapters | ✅ Cumple | Puertos y adaptadores Prisma/Wompi inyectados en módulos NestJS. | — |
| ROP | ✅ Cumple | `backend/src/common/result/result.ts`, `app-error.ts`, `backend/src/common/http/result-to-http.ts`; casos de uso devuelven `Result<T, AppError>` y pagos encadenan `andThenAsync`. | Validación E2E Sandbox externa pendiente; contrato HTTP y tests mockeados conservados. |
| MySQL/MariaDB | ✅ Cumple | `backend/prisma/schema.prisma` usa `mysql`; catálogo público servido. | Confirmar host cloud en panel Railway. |
| Prisma | ✅ Cumple | Prisma Client, repositorios y esquema introspectado. | — |
| Seed dummy | ⚠️ Parcial | `backend/prisma/seed.ts` y `npm run db:seed`; inserta solo si no hay productos ajenos y nunca actualiza existentes. | No ejecutado sobre Railway; comprobar dummies allí si se exige evidencia. |
| Endpoints stock/transacciones/clientes/entregas | ✅ Cumple | Módulos y controladores; `/api/productos` GET público 200. | No se realizaron POST contra producción. |
| Swagger / documentación API | ✅ Cumple | `/api/docs` en Railway GET 200. | — |
| Jest frontend/backend | ✅ Cumple | 102 y 128 tests aprobados con mocks; incluye Result y contrato HTTP. | — |
| Coverage global >80% | ✅ Cumple | Frontend 93.53/87.89/94.84/97.38; backend 95.17/86.16/96.57/97.79 (S/B/F/L). | Algunos archivos individuales no llegan a 80%; el criterio global sí. |
| Sandbox | ✅ Cumple | Adapter restringe credenciales de prueba; registros previos DECLINED/APPROVED; tests PENDING/idempotencia. | No se repitieron pagos reales en esta fase. |
| Seguridad | ⚠️ Parcial | Tarjeta no persistida, JWE, DTOs, HTTPS; `.env.example` sin valores reales. | `backend/.env` es accesible en un commit histórico público: revocar/rotar credenciales y evaluar historial antes de entregar. |
| GitHub público | ✅ Cumple | `jarison102/Development-Test` respondió 200; nombre sin proveedor. | No hacer push hasta resolver hallazgo de seguridad. |
| Frontend deploy | ✅ Cumple | Vercel HTTPS y bundle apunta a API Railway. | — |
| Backend deploy | ✅ Cumple | Railway HTTPS, catálogo y Swagger GET 200, CORS/preflight válidos. | — |
| Database deploy | ✅ Cumple | Railway indicado por el responsable; lectura pública del catálogo funciona. | Confirmar host y esquema cloud directamente en panel Railway, sin publicar credenciales. |
| Modal de tarjeta / backdrop de resumen del enunciado | ⚠️ Parcial | Flujo funcional en páginas `CheckoutPage`/`SummaryPage`, no modal/backdrop literal. | Diferencia visual con el documento; sin cambios funcionales en esta fase. |
