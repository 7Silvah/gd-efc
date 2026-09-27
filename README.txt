================================================================
 gd-efc — Google Drive Encrypted Folder Copy (edición Node.js)
================================================================

1. QUÉ ES Y CÓMO FUNCIONA
-------------------------
gd-efc permite compartir carpetas de Google Drive mediante enlaces
cifrados que ocultan el ID real de la carpeta.

Arquitectura (todo JavaScript):
  - Backend Node.js 20 + Express (carpeta server/).
  - Frontend estático servido por el propio backend (carpeta public/):
    index.html para desencriptar/copiar, build.html (legacy) para generar
    descriptores.
  - Cifrado AES-256-GCM (módulo compartido shared/crypto.js).
  - Protocolo servidor versión 4, compatible con los clientes originales:
      POST /info    -> resuelve un ID cifrado y lista la carpeta
      POST /clone   -> clona archivos a tu cuenta de Drive
      GET  /encrypt -> página para cifrar enlaces (genera enlaces que
                       apuntan de vuelta a tu propio servidor)
      POST /encrypt -> cifra un ID de carpeta con la llave del servidor
      GET  /health  -> estado del servidor
      GET  /oauth/config -> client_id público para el login de Google
      POST /oauth/token  -> intercambio código<->token con Google (el
                       client_secret NUNCA sale del servidor)
  - Caché SQLite de respuestas /info (ahorra cuota de la API de Drive),
    rate limiting en POST y logs de peticiones.

Flujo típico:
  1. Cifras el ID de tu carpeta en GET /encrypt y compartes el enlace.
  2. Quien lo abre pega el enlace en index.html, conecta su cuenta de
     Google y copia la carpeta a su Drive con un clic.


2. LO QUE DEBES PROPORCIONAR
----------------------------
a) Node.js 20 o superior (https://nodejs.org).

b) Credenciales OAuth de Google (para que la app copie en TU Drive):
   1. Ve a https://console.cloud.google.com
   2. Crea un proyecto (o usa uno existente).
   3. "APIs y servicios" -> "Biblioteca" -> habilita "Google Drive API".
   4. "APIs y servicios" -> "Credenciales" -> "Crear credenciales" ->
      "ID de cliente de OAuth".
      - Tipo de aplicación: "Aplicación web".
      - En "URIs de redirección autorizados" agrega:
          http://127.0.0.1:53683/
   5. Copia el "ID de cliente" y el "Secreto de cliente".
   6. En tu archivo .env:
          GOOGLE_CLIENT_ID=tu-id.apps.googleusercontent.com
          GOOGLE_CLIENT_SECRET=tu-secreto

c) Llave de cifrado AES-256 (la que cifra los enlaces). Genérala así:
      node -e "import('./shared/crypto.js').then(m => m.generateKey().then(console.log))"
   y ponla en tu .env:
          EFC_KEY=la-llave-generada
   IMPORTANTE: quien tenga esta llave puede descifrar tus enlaces.
   No la subas a Git ni la compartas.

d) Archivo .env (copia el ejemplo y rellénalo):
      cp .env.example .env
   Variables:
      PORT=3000                        puerto del servidor
      EFC_KEY=                         llave AES-256 en base64 (32 bytes)
      GOOGLE_CLIENT_ID=                de Google Cloud
      GOOGLE_CLIENT_SECRET=            de Google Cloud
      CORS_ORIGIN=*                    orígenes permitidos (* = todos)
      CACHE_TTL_SECONDS=60             caché de /info (0 = desactivada)
      RATE_LIMIT_MAX=60                máx. POST por IP y ventana
      RATE_LIMIT_WINDOW_SECONDS=60     ventana del rate limit en segundos
      EFC_PUBLIC_URL=                  (opcional) URL pública del servidor,
                                       p.ej. https://mi-servidor.com.
                                       Si no se define, se usa el Host
                                       de la petición.
      CACHE_DB=                        (opcional) ruta del SQLite


3. PROBAR LOCALMENTE PASO A PASO
--------------------------------
# 1. Instalar dependencias
npm install

# 2. Configurar
cp .env.example .env
# edita .env: pon EFC_KEY (genérala como se indica arriba).
# Para probar los endpoints sin Google, basta con EFC_KEY.

# 3. Tests automatizados (26 tests: cripto, protocolo, oauth, caché, rate limit)
npm test

# 4. Arrancar en desarrollo (recarga automática)
npm run dev
# o en producción:
npm start

# 5. Probar los endpoints con curl (puerto 3000):
# Salud
curl http://localhost:3000/health
# -> {"status":"ok","version":4}

# Cifrar un ID de carpeta
curl -X POST http://localhost:3000/encrypt \
  -H 'Content-Type: application/json' \
  -d '{"folder":"1AbC2dEfGhIjKlMnOpQrStUv"}'
# -> {"status":"ok","data":"<ID cifrado>","version":4}

# Página para cifrar enlaces (ábrela en el navegador)
# http://localhost:3000/encrypt

# /info con un ID inválido (forma de error del protocolo v4)
curl -X POST http://localhost:3000/info \
  -H 'Content-Type: application/json' \
  -d '{"auth":"x","folder":"no-es-base64"}'
# -> {"status":"error","reason":"...","version":4}

# Config OAuth (vacío hasta que definas GOOGLE_CLIENT_ID)
curl http://localhost:3000/oauth/config
# -> {"clientId":""}

# /oauth/token sin credenciales configuradas
curl -X POST http://localhost:3000/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"code":"abc","grant_type":"authorization_code"}'
# -> {"status":"error","reason":"OAuth not configured on server ...","version":4}

# 6. Probar el frontend en el navegador
#    Abre http://localhost:3000/index.html?dev=1
#    (?dev=1 usa el main.js legible; sin el parámetro usa main.obf.js)
#    La página intentará usar el backend local automáticamente.

# 7. Prueba manual de copia real en Drive (requiere tus credenciales Google):
#    [ ] .env con GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET reales
#    [ ] npm run dev y abrir http://localhost:3000/index.html?dev=1
#    [ ] Clic en "Select account" -> "Get auth", copiar la URL redirigida
#    [ ] Pegar el código y verificar que aparece tu cuenta
#    [ ] Generar un enlace cifrado en http://localhost:3000/encrypt
#         con el ID de una carpeta de prueba de tu Drive
#    [ ] Pegar el enlace en index.html y verificar que lista los archivos
#    [ ] Seleccionar archivos y copiarlos a tu cuenta; verificar en Drive
#    [ ] Probar que un enlace ajeno (otra llave) muestra error sin romper
#         la página

4. DESPLIEGUE CON DOCKER
-----------------------
docker compose up --build
# Lee las variables desde .env. La caché SQLite persiste en el volumen
# gd-efc-data.

5. NOTAS
--------
- public/build.html y public/templates/ (PHP/Cloudflare Worker) se conservan
  como legacy para generar descriptores independientes; el backend Node los
  reemplaza.
- public/main.obf.js se regenera desde public/main.js con:
      npx javascript-obfuscator public/main.js --output public/main.obf.js
- La copia con cuenta "dummy" sigue sin implementarse (limitación heredada).
