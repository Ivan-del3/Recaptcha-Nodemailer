# reCAPTCHA v2 — Formulario de contacto con Astro

---

## 1. Contexto del servicio: qué es y quién ofrece este servicio

**reCAPTCHA** es un servicio gratuito desarrollado y mantenido por **Google** cuyo propósito es distinguir usuarios humanos de bots automatizados. Google lo adquirió en 2009 y desde entonces lo ha integrado en su ecosistema de seguridad web.

El servicio se consume a través de la **Google reCAPTCHA API**, accesible desde la consola de administración en `google.com/recaptcha/admin`. Desde ahí se registran los sitios, se obtienen las claves y se accede a los paneles de análisis de tráfico.

**Variantes disponibles actualmente:**

| Variante | Descripción |
|---|---|
| **reCAPTCHA v2 Checkbox** | Muestra el checkbox "No soy un robot". El usuario interactúa explícitamente. |
| **reCAPTCHA v2 Invisible** | Sin checkbox visible; lanza el desafío solo cuando Google detecta comportamiento sospechoso. |
| **reCAPTCHA v3** | No interrumpe al usuario. Asigna una puntuación de 0.0 a 1.0 de probabilidad de ser humano. El desarrollador decide qué hacer con esa puntuación. |
| **reCAPTCHA Enterprise** | Versión de pago con mayor precisión, métricas avanzadas, y SLA de Google Cloud. Orientada a e-commerce, banca y grandes plataformas. |

Este proyecto usa **reCAPTCHA v2 Checkbox**, la variante con acción explícita del usuario.

---

## 2. ¿Por qué este servicio?

**Problema que resuelve:** Un formulario de contacto sin protección es trivialmente abusable por scripts automatizados que envían spam, saturan el servidor o realizan ataques de enumeración.

**Por qué reCAPTCHA v2 y no otra variante:**

- **v2 Checkbox** exige una acción consciente del usuario antes de poder enviar. Para un formulario de contacto, esta fricción mínima es aceptable y comunica visualmente que el sitio está protegido.
- **v3** no requiere interacción, pero delega en el desarrollador la lógica de decidir si la puntuación es suficiente. Añade complejidad sin una ventaja clara para un formulario de contacto sencillo.
- **Enterprise** tiene coste económico y está dimensionado para volúmenes de tráfico y requisitos de cumplimiento que no aplican a este proyecto.

**Por qué Google y no una alternativa:**

- Tasa de reconocimiento casi universal: los usuarios saben qué es el checkbox y cómo completarlo.
- La infraestructura de análisis de comportamiento de Google (movimiento del ratón, historial del navegador, patrones de clic) es más robusta que la de competidores open-source como hCaptcha o Friendly Captcha.
- Integración directa: el SDK oficial de JavaScript está alojado en CDN de Google y no requiere ninguna dependencia en `package.json`.

---

## 3. Especificación de la API

reCAPTCHA v2 expone dos superficies de API distintas: una en el **cliente** (JavaScript) y otra en el **servidor** (HTTP).

### 3.1 API de cliente — `api.js`

Se carga con una etiqueta `<script>` apuntando a:

```
https://www.google.com/recaptcha/api.js
```

**Parámetro clave:** `?render=explicit`

Por defecto, el script busca automáticamente elementos `<div class="g-recaptcha">` en el DOM y renderiza el widget ahí. Con `render=explicit` este comportamiento se desactiva y el control pasa completamente al código:

```js
window.grecaptcha.render(elementoDOM, opciones)
```

**Opciones de `grecaptcha.render()`:**

| Opción | Tipo | Descripción |
|---|---|---|
| `sitekey` | string | Clave pública del sitio. Identifica el dominio ante Google. |
| `size` | `"normal"` \| `"compact"` | Tamaño del widget. `compact` para pantallas estrechas. |
| `callback` | function | Se llama cuando el usuario completa el reCAPTCHA. Recibe el token. |
| `expired-callback` | function | Se llama cuando el token caduca (~2 minutos tras generarse). |
| `error-callback` | function | Se llama si hay un error de red al verificar el challenge. |
| `theme` | `"light"` \| `"dark"` | Color del widget. |
| `tabindex` | number | Para navegación por teclado. |

**Otros métodos del objeto `grecaptcha`** (no usados en este proyecto pero parte de la API):

- `grecaptcha.reset(widgetId)` — resetea el widget manualmente sin esperar a que caduque.
- `grecaptcha.getResponse(widgetId)` — obtiene el token actual sin usar el callback.
- `grecaptcha.execute(widgetId)` — usado en v2 Invisible para lanzar el challenge programáticamente.

### 3.2 API de servidor — `siteverify`

Endpoint HTTP para validar el token desde el backend:

```
POST https://www.google.com/recaptcha/api/siteverify
Content-Type: application/x-www-form-urlencoded
```

**Parámetros del body:**

| Parámetro | Requerido | Descripción |
|---|---|---|
| `secret` | sí | La clave secreta del sitio (solo servidor, nunca expuesta al cliente). |
| `response` | sí | El token generado por el widget en el cliente. |
| `remoteip` | no | IP del usuario. Si se incluye, Google la usa como señal adicional de verificación. |

**Respuesta JSON:**

```json
{
  "success": true,
  "challenge_ts": "2024-01-15T10:30:00Z",
  "hostname": "tudominio.com",
  "error-codes": []
}
```

En caso de fallo:

```json
{
  "success": false,
  "error-codes": ["invalid-input-response"]
}
```

**Códigos de error posibles:**

| Código | Significado |
|---|---|
| `missing-input-secret` | No se envió la clave secreta. |
| `invalid-input-secret` | La clave secreta es incorrecta. |
| `missing-input-response` | No se envió el token. |
| `invalid-input-response` | El token está corrupto, ha caducado o ya fue usado. |
| `bad-request` | La petición tiene un formato incorrecto. |
| `timeout-or-duplicate` | El token se usó más de una vez o superó el tiempo de validez. |

### 3.3 El par de claves

El sistema usa dos claves con responsabilidades opuestas:

| Clave | Variable en este proyecto | Dónde vive | Para qué sirve |
|---|---|---|---|
| **Site key** (pública) | `PUBLIC_RECAPTCHA_SITE_KEY` | Navegador | Renderizar el widget; identificar el dominio ante Google |
| **Secret key** (privada) | `RECAPTCHA_SECRET` | Servidor | Verificar el token en `siteverify`; nunca debe exponerse al cliente |

En Astro, el prefijo `PUBLIC_` hace que la variable sea accesible desde el bundle del cliente. Las variables sin ese prefijo son exclusivamente del servidor.

---

## 4. Código: cómo se incorpora la API al proyecto

El token viaja a través de cuatro archivos en orden. A continuación se describe cada uno con el fragmento relevante.

### Paso 1 — Cargar el script de Google (`src/utils/recaptchaLoader.js`)

En lugar de añadir un `<script>` en el HTML, el script se inserta dinámicamente. La promesa se guarda en `window._grecaptchaPromise` como singleton para evitar cargar el script dos veces si el componente se re-monta.

```js
export function loadRecaptcha() {
  if (window._grecaptchaPromise) return window._grecaptchaPromise;

  window._grecaptchaPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.grecaptcha.ready(() => resolve(window.grecaptcha));
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return window._grecaptchaPromise;
}
```

`render=explicit` impide que el script renderice el widget automáticamente al cargar, dando control total al componente React.

---

### Paso 2 — Renderizar el widget y capturar el token (`src/components/Recaptcha.jsx`)

El componente recibe la `siteKey` como prop y llama a `grecaptcha.render()` con los callbacks de verificación y caducidad.

```jsx
export default function Recaptcha({ siteKey }) {
  const containerRef = useRef(null);

  useEffect(() => {
    loadRecaptcha().then((grecaptcha) => {
      grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        size: window.innerWidth < 550 ? "compact" : "normal",

        callback: (token) => {
          // Escribir el token en el input oculto del formulario
          document.getElementById("g-recaptcha-response").value = token;
          // Señalizar al botón de envío que la verificación fue exitosa
          window.__recaptchaVerified = true;
          window.dispatchEvent(new CustomEvent("recaptcha:verified", { detail: token }));
        },

        "expired-callback": () => {
          document.getElementById("g-recaptcha-response").value = "";
          window.__recaptchaVerified = false;
          window.dispatchEvent(new CustomEvent("recaptcha:expired"));
        },
      });
    });
  }, [siteKey]);

  return <div ref={containerRef} />;
}
```

---

### Paso 3 — Conectar el widget al formulario (`src/pages/index.astro`)

El formulario incluye el componente React y un input oculto que actúa de puente entre el widget y el POST estándar del formulario.

```astro
<form method="POST" action={actions.enviarCorreo} enctype="multipart/form-data">

  <!-- ... campos de texto ... -->

  <!-- Widget reCAPTCHA (solo ejecuta en el navegador) -->
  <Recaptcha
    client:only="react"
    siteKey={import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY}
  />

  <!-- El callback de Recaptcha.jsx escribe aquí el token -->
  <input type="hidden" id="g-recaptcha-response" name="g-recaptcha-response" />

  <!-- El botón se activa cuando recibe el evento "recaptcha:verified" -->
  <SubmitButton client:only="react" />

</form>
```

`client:only="react"` indica a Astro que estos componentes solo se ejecutan en el navegador (reCAPTCHA necesita `window` y el DOM, que no existen en el servidor).

---

### Paso 4 — Verificar el token en el servidor (`src/actions/index.ts`)

Esta es la barrera de seguridad real. El servidor extrae el token del POST y lo valida con `siteverify` antes de enviar el correo.

```ts
const recaptchaToken = formData.get("g-recaptcha-response")?.toString();

const recaptchaRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `secret=${process.env.RECAPTCHA_SECRET}&response=${recaptchaToken}`,
});

const recaptchaData = await recaptchaRes.json();

if (!recaptchaData.success) {
  throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo verificar que seas humano" });
}

// Solo si success === true → enviar el correo con Nodemailer
```

La clave `RECAPTCHA_SECRET` (sin prefijo `PUBLIC_`) nunca llega al navegador. Si el token está vacío, caducado o ya fue usado, Google devuelve `success: false` y el servidor rechaza la petición antes de llegar al envío del correo.

---

### Flujo completo del token

```
NAVEGADOR
  1. Recaptcha.jsx carga api.js con render=explicit
  2. grecaptcha.render() muestra el checkbox
  3. Usuario completa el reCAPTCHA
  4. Google llama a callback(token)
  5. token → input#g-recaptcha-response
  6. CustomEvent "recaptcha:verified" → botón se activa
  7. Usuario envía el formulario

        POST multipart/form-data
               ↓

SERVIDOR (Astro Action)
  8. Extrae token de formData.get("g-recaptcha-response")
  9. POST a api/siteverify con secret + token
 10. Google responde { success: true/false }
 11. Si false → error | Si true → envía correo con Nodemailer
```
