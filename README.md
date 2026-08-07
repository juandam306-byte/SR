# SR — Sin Restricciones

Red social estática creada con HTML, CSS, JavaScript y Supabase.

## SR como aplicación para Android y PC

SR incluye un logotipo propio y está preparada como **PWA** (aplicación web instalable). Tras publicarla en GitHub Pages con HTTPS, una misma versión funciona como app en Android y como programa de escritorio en Windows, macOS o Linux:

- **Android:** abre la URL de SR en Chrome → menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**.
- **PC:** abre SR en Chrome o Edge → botón **Instalar** de la página o el icono de instalación de la barra de direcciones.

La aplicación se abre en su propia ventana, conserva la sesión y recibe las mismas actualizaciones en tiempo real. Para crear un `.apk` o `.exe` firmado haría falta añadir un proceso de empaquetado y certificados de distribución; la PWA no requiere esos secretos ni una tienda de aplicaciones.

## Antes de usar las funciones sociales

En Supabase abre **SQL Editor → New query**, copia y ejecuta completo [supabase-social-features.sql](./supabase-social-features.sql). Esta migración añade:

- perfiles, seguimiento y contadores reales;
- verificación desde 1.000 seguidores y verificación dorada desde 100 millones;
- likes, reposts y comentarios;
- notificaciones y mensajes privados;
- bucket de fotos, videos y audios;
- actualizaciones en tiempo real mediante Supabase Realtime.

`follower_count` es el número de seguimientos reales. Para ajustar la cifra que muestra un perfil desde el Dashboard de Supabase, modifica `follower_bonus` en la tabla `profiles`. Este campo no puede ser cambiado desde la web pública.

## Ajustes, foto e historias

Después ejecuta [supabase-social-extras.sql](./supabase-social-extras.sql) en **SQL Editor**. Añade:

- foto de perfil, cinco temas personales e imagen de fondo subida por cada usuario;
- ajustes de notificaciones, actividad y permisos de mensajes;
- buscador de usuarios para ver perfiles, seguirlos y abrir una conversación;
- historias de fotos o videos privadas: solo la persona autora y sus seguidores pueden verlas durante 12 horas;
- varias historias por persona, navegación anterior/siguiente y borrado de las propias;
- reacciones, respuestas y destacadas permanentes.

Puedes ejecutar este archivo de nuevo sin perder datos: aplica de forma segura las columnas, permisos y políticas más recientes.

## Privacidad, Explorar y chat mejorado

Por último ejecuta [supabase-social-advanced.sql](./supabase-social-advanced.sql) en **SQL Editor**. Activa:

- cuentas privadas y solicitudes para seguir, con aprobación o rechazo desde el perfil;
- ocultar el número/listado de seguidores y elegir quién comenta;
- protección real de publicaciones, comentarios, reacciones y destacadas mediante RLS;
- respuestas, reacciones ❤️ 👍 😂, indicador de escritura y borrado de mensajes;
- Explorador de publicaciones, búsqueda por texto/hashtag y tendencias.

Esta migración también es segura para volver a ejecutarla. Debe ejecutarse después de los dos archivos SQL anteriores.

## Reels y enlaces multimedia

Ejecuta después [supabase-social-reels.sql](./supabase-social-reels.sql) en **Supabase → SQL Editor → New query → Run**. Activa:

- la pestaña **Reels**, que carga los videos en páginas de ocho en lugar de descargar miles a la vez;
- reproducción vertical automática y en bucle para videos subidos a SR;
- likes, comentarios, reposts y acceso al perfil de la persona que publicó cada Reel;
- enlaces HTTPS de YouTube y videos directos `.mp4`, `.webm` u `.ogv` que tengas autorización de compartir;
- enlaces de video y audio directos en mensajes privados.

Para crear un Reel, publica un archivo de video o pega un enlace público autorizado en el campo nuevo del formulario. Toda publicación de tipo video aparece automáticamente en Reels. No agregues películas, canciones ni videos de otras personas sin licencia o permiso: SR no descarga ni copia contenido de Internet y la persona que publica conserva la responsabilidad sobre los derechos de uso.

## Rendimiento

- Inicio carga 12 publicaciones iniciales y trae la siguiente página automáticamente al acercarte al final.
- Reels carga 8 videos por vez mientras deslizas dentro del feed vertical.
- Las imágenes usan carga diferida y decodificación asíncrona; los videos de Inicio no descargan metadatos hasta que la persona decide reproducirlos.
- La PWA guarda la interfaz estática en caché para abrir más rápido después de la primera visita.

## Video procesado en servidor (opcional)

SR puede enviar videos de publicaciones y mensajes a Cloudinary para entregarlos con formato, calidad y tamaño optimizados desde el servidor. Sin esta configuración, los videos siguen funcionando desde Supabase Storage, pero no se transcodifican.

1. Crea un entorno en Cloudinary y obtén `cloud name`, `API key` y `API secret`.
2. Con Supabase CLI vinculado a tu proyecto, guarda los secretos:

```powershell
supabase secrets set CLOUDINARY_CLOUD_NAME=TU_CLOUD_NAME CLOUDINARY_API_KEY=TU_API_KEY CLOUDINARY_API_SECRET=TU_API_SECRET
```

3. Despliega las dos funciones:

```powershell
supabase functions deploy sign-video-upload
supabase functions deploy delete-cloudinary-video
```

La aplicación solo recibe una firma temporal: el secreto de Cloudinary nunca se envía al navegador. Al eliminar una publicación o un mensaje propio, SR intenta eliminar también su video procesado.

## Borrado automático de historias y publicaciones

La web limpia los registros de historias caducadas cuando alguien carga historias. Para liberar también sus archivos de Storage y borrar de forma automática las publicaciones que tengan **30 días o más**, ya está incluida la Edge Function [cleanup-expired-stories](./supabase/functions/cleanup-expired-stories/index.ts) y un flujo horario de GitHub Actions. Al borrar una publicación se eliminan también sus likes, comentarios, reposts, notificaciones y archivo multimedia asociados.

1. Instala e inicia sesión en Supabase CLI: `supabase login`.
2. Vincula este proyecto: `supabase link --project-ref dldryszmtvunrqzpnkgs`.
3. Crea un secreto aleatorio y guárdalo solo en Supabase: `supabase secrets set SR_STORY_CLEANUP_TOKEN=TU_TOKEN_ALEATORIO`.
4. Despliega: `supabase functions deploy cleanup-expired-stories`.
5. En GitHub → **Settings → Secrets and variables → Actions**, crea:
   - `SR_STORY_CLEANUP_URL`: `https://dldryszmtvunrqzpnkgs.supabase.co/functions/v1/cleanup-expired-stories`
   - `SR_STORY_CLEANUP_TOKEN`: el mismo secreto aleatorio.

El archivo `.github/workflows/cleanup-expired-stories.yml` la ejecutará cada hora. Las publicaciones vencen exactamente a los 30 días; el siguiente ciclo horario las borrará. No expongas ese token, las claves secretas ni `service_role` en el navegador.

## Abrirla en tu equipo

Abre la carpeta con VS Code e inicia la extensión **Live Server**. La URL debe ser `http://localhost:5500`, autorizada previamente en Supabase.

También puedes ejecutar en PowerShell desde esta carpeta:

```powershell
python -m http.server 5500
```

Luego visita `http://localhost:5500`.

## Almacenamiento y limpieza

- Las imágenes se reducen a un máximo de 1920 px y se convierten a WebP antes de subirlas.
- Los videos y audios se limitan por tamaño. Comprimir o transcodificar video de forma fiable requiere una función de servidor o un servicio de video; no debe hacerse con una clave pública del navegador.
- No hay una señal de “espacio casi lleno” disponible para una web estática. SR aplica la política definida de conservar publicaciones durante 30 días mediante una Edge Function programada.

## Publicarla en GitHub Pages

1. Sube todos los archivos al repositorio `SR`.
2. En GitHub abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**, rama `main` y carpeta `/(root)`.
4. Guarda y espera la publicación en `https://juandam306-byte.github.io/SR/`.

La clave de `supabase.js` es publicable. No agregues ni subas una clave `sb_secret_...` o `service_role`.
