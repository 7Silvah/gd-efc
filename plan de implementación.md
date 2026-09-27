# Plan de implementación — gd-efc 100% JavaScript (Node.js)

> Migrar gd-efc a un stack único de JavaScript: frontend + backend en Node.js.
> Cada fase termina con la app funcionando. Nada se rompe a medias.

## 1. Punto de partida (lo que hay hoy)

| Pieza | Tecnología | Rol |
|---|---|---|
| `index.html` + `main.js` | JS vanilla + jQuery + Bootstrap 4 | UI: desencriptar enlaces y copiar carpetas de Drive |
| `common.js` | WebCrypto AES-256-GCM | Cifrado compartido |
| `build.html` | Generador de ZIP | Produce descriptores listos para desplegar |
| `templates/` | Cloudflare Worker / PHP / HTML estático | 3 backends alternativos (se generan, no se ejecutan aquí) |

**Acoplamientos clave a respetar:**
- Protocolo servidor versión **4** (`SERVER_PROTOCOL_VERSION`) — el front lo exige.
- Endpoints del servidor: `POST /info`, `POST /clone`, `GET/POST /encrypt`.
- OAuth Google estilo rclone (`oauth2.googleapis.com/token`); hoy el `client_secret` viaja en la página (inseguro por diseño).

## 2. Arquitectura objetivo

```
 Navegador (index.html, JS vanilla)
        │  fetch /api/*
        ▼
 Node.js (Express)
   ├── POST /api/info      → info del servidor (protocolo v4)
   ├── POST /api/clone     → resuelve ID cifrado → datos de carpeta
   ├── GET/POST /api/encrypt → cifrar IDs (la llave ya no sale del servidor)
   ├── GET /api/health     → estado
   ├── OAuth Google en servidor → el client_secret deja de viajar al front
   ├── AES-256-GCM isomórfico (WebCrypto existe en Node 20+)
   └── SQLite → caché de servidores, rate limiting
```

**Stack propuesto:** Node 20 LTS · Express · `better-sqlite3` · `node:test` · Docker.

## 3. Fases

### Fase 0 — Base del proyecto
- [ ] `npm init`, Express, estructura: `/server`, `/public` (front actual), `/shared`
- [ ] `.env` (puerto, llaves, credenciales Google) + `.env.example`
- [ ] `npm run dev` con recarga (node --watch)
- [ ] **Done:** `GET /api/health` responde `{"ok":true}`

### Fase 1 — Cripto isomórfico
- [ ] Mover `common.js` a `/shared/crypto.js` como módulo (export/import)
- [ ] Verificar que funciona igual en Node (WebCrypto es global desde Node 20)
- [ ] Tests `node:test`: roundtrip cifrar→descifrar, llave de 32 bytes, IV aleatorio
- [ ] **Done:** `npm test` en verde; el front sigue usando el mismo archivo

### Fase 2 — Backend mínimo (protocolo v4)
- [ ] Portar la lógica de `worker.js.template` / `decrypt.php.template` a `server/routes/`
- [ ] `POST /api/info` y `POST /api/clone` con el mismo formato de respuesta que hoy
- [ ] Probar contra el front actual (`index.html?dev=1`) apuntando al backend local
- [ ] **Done:** copiar una carpeta real usando solo el backend Node

### Fase 3 — OAuth en el servidor (mejora de seguridad)
- [ ] El intercambio código→token se hace en Node; el front recibe solo tokens de corta vida
- [ ] `defaultClientSecret` desaparece del `index.html`
- [ ] **Done:** flujo completo sin secretos en el navegador

### Fase 4 — Frontend
- [ ] `index.html` apunta a `/api/*` del backend Node (cambios mínimos primero)
- [ ] Decidir `build.html`: convertirla en página de **config/admin** o eliminarla (el ZIP ya no tiene sentido)
- [ ] Opcional después: jQuery → vanilla, Bootstrap 4 → 5
- [ ] **Done:** la app completa corre con `npm run dev`

### Fase 5 — Persistencia y robustez
- [ ] SQLite: caché de servidores y de infos desencriptadas (hoy es localStorage)
- [ ] Rate limiting básico en `/api/*`
- [ ] Logs con niveles (info/error)
- [ ] **Done:** reiniciar el servidor no pierde caché

### Fase 6 — Empaquetado
- [ ] `Dockerfile` + `docker-compose.yml` (un contenedor, un comando)
- [ ] Toda la config por variables de entorno
- [ ] **Done:** `docker compose up` levanta la app funcional

### Fase 7 — Limpieza legacy
- [ ] Decidir: archivar `templates/` PHP/Worker o mantenerlos como alternativa
- [ ] Actualizar README con la nueva arquitectura

## 4. Riesgos
- **Modelo de despliegue cambia:** hoy es página estática; con backend Node necesitas un servidor siempre encendido.
- **Cuotas de Drive API:** el backend centraliza llamadas → vigilar límites.
- **`main.js`** aún tiene ~45 identificadores sin renombrar; renombrarlos facilita las Fases 2–4.

## 5. Decisiones abiertas (para ti)
1. ¿Express o Fastify?
2. ¿Modernizar el front (quitar jQuery) o mantenerlo?
3. ¿`build.html` se convierte en admin o se elimina?
4. ¿Se mantienen los templates PHP/Worker como legacy?

## 6. Cómo trabajarlo con Muse code (prompts por fase)
- Fase 1: *"Convierte common.js a módulo ES compartido y crea tests de roundtrip AES-GCM con node:test"*
- Fase 2: *"Porta templates/worker.js.template a rutas Express POST /api/info y POST /api/clone manteniendo el protocolo v4"*
- Fase 3: *"Mueve el intercambio OAuth a un endpoint del servidor y actualiza index.html para no exponer el client_secret"*
- Fase 6: *"Crea Dockerfile multistage y docker-compose.yml para esta app Node+Express"*

> Regla de oro: una fase a la vez, cada una con `npm test` en verde y la app funcionando antes de pasar a la siguiente.
