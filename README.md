# reCAPTCHA v2 en este proyecto

Guía completa sobre cómo funciona Google reCAPTCHA v2 en este formulario de contacto: desde crear la cuenta hasta seguir el token a través de cada archivo del código.

---

## Índice

1. [Qué es reCAPTCHA v2 y por qué dos claves](#1-qué-es-recaptcha-v2-y-por-qué-dos-claves)
2. [Crear cuenta y obtener las claves](#2-crear-cuenta-y-obtener-las-claves)
3. [Configurar las variables de entorno](#3-configurar-las-variables-de-entorno)
4. [Cómo se usa reCAPTCHA en cada archivo](#4-cómo-se-usa-recaptcha-en-cada-archivo)
   - [recaptchaLoader.js — carga del script de Google](#41-recaptchaloaderjs--carga-del-script-de-google)
   - [Recaptcha.jsx — el widget visual](#42-recaptchajsx--el-widget-visual)
   - [index.astro — el formulario y el input oculto](#43-indexastro--el-formulario-y-el-input-oculto)
   - [SubmmitButton.jsx — el botón controlado por reCAPTCHA](#44-submmitbuttonjsx--el-botón-controlado-por-recaptcha)
   - [actions/index.ts — verificación en el servidor](#45-actionsindexts--verificación-en-el-servidor)
5. [Flujo completo del token](#5-flujo-completo-del-token)
6. [Por qué el token solo se usa una vez](#6-por-qué-el-token-solo-se-usa-una-vez)
7. [Problemas frecuentes con reCAPTCHA](#7-problemas-frecuentes-con-recaptcha)

---

## 1. Qué es reCAPTCHA v2 y por qué dos claves

reCAPTCHA v2 es un servicio de Google que muestra el checkbox "No soy un robot". Cuando el usuario lo completa, Google emite un **token temporal** que prueba que pasó la verificación.

El sistema usa **dos claves distintas** con responsabilidades opuestas:

| Clave | Nombre en Google | Variable en este proyecto | Dónde vive |
|---|---|---|---|
| **Site key** (pública) | Clave del sitio | `PUBLIC_RECAPTCHA_SITE_KEY` | Navegador — se incluye en el HTML |
| **Secret key** (privada) | Clave secreta | `RECAPTCHA_SECRET` | Servidor — nunca sale del backend |

La **site key** identifica tu sitio ante Google y permite renderizar el widget en el navegador. No importa que sea visible: por sí sola no sirve para falsificar tokens.

La **secret key** se usa en el servidor para preguntarle a Google "¿este token que me mandó el usuario es legítimo?". Si esta clave se filtrara al cliente, cualquiera podría verificar tokens arbitrarios y saltarse la protección.

> En Astro, las variables con prefijo `PUBLIC_` están disponibles en el navegador vía `import.meta.env`. Las variables sin ese prefijo son exclusivamente del servidor y nunca se incluyen en el bundle del cliente.

---

## 2. Crear cuenta y obtener las claves

### Paso 1 — Ir a la consola de reCAPTCHA

Ve a [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin) e inicia sesión con tu cuenta de Google.

### Paso 2 — Registrar un sitio nuevo

Haz clic en el botón **+** (crear nuevo sitio) y rellena el formulario:

**Etiqueta**
Un nombre descriptivo solo para ti. Ejemplo: `mi-portfolio-contacto`.

**Tipo de reCAPTCHA**
Selecciona **reCAPTCHA v2** → **"No soy un robot" Checkbox**.

> Existen otras variantes (v2 Invisible, v3, Enterprise). Este proyecto usa específicamente la v2 Checkbox porque el formulario requiere una acción explícita del usuario antes de poder enviar.

**Dominios**
Añade todos los dominios donde usarás el formulario. Puedes añadir varios:

```
localhost
tudominio.com
www.tudominio.com
```

`localhost` es imprescindible para que el widget funcione durante el desarrollo local. Sin él, el widget cargará pero fallará silenciosamente al verificar.

**Propietarios**
Tu cuenta de Google ya aparece por defecto. No es necesario cambiar nada.

**Acepta las condiciones** y haz clic en **Enviar**.

### Paso 3 — Copiar las claves

Tras crear el sitio, Google muestra inmediatamente las dos claves:

```
Clave del sitio:  6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Clave secreta:    6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Cópialas ahora. Siempre puedes volver a esta pantalla desde la consola de reCAPTCHA si las necesitas de nuevo.

### Paso 4 — Añadir dominios posteriores (si es necesario)

Si después necesitas añadir un dominio de producción que no registraste al principio:

1. En la consola de reCAPTCHA, selecciona tu sitio.
2. Ve al icono de configuración (engranaje).
3. En la sección **Dominios**, añade el nuevo dominio y guarda.

Los cambios de dominio tardan unos minutos en propagarse.

---

## 3. Configurar las variables de entorno

Crea o edita el archivo `.env` en la raíz del proyecto:

```env
PUBLIC_RECAPTCHA_SITE_KEY=6LeXXX...   # Clave del sitio (pública, va al navegador)
RECAPTCHA_SECRET=6LeXXX...            # Clave secreta (solo servidor)
```

Verifica que `.env` está en `.gitignore` para no subir las claves al repositorio.

---

## 4. Cómo se usa reCAPTCHA en cada archivo

### 4.1 `recaptchaLoader.js` — carga del script de Google

**Ruta:** `src/utils/recaptchaLoader.js`

```js
export function loadRecaptcha() {
  if (window._grecaptchaPromise) return window._grecaptchaPromise;

  window._grecaptchaPromise = new Promise((resolve, reject) => {
    const scriptId = "recaptcha-script";

    const onLoad = () => {
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(() => resolve(window.grecaptcha));
      } else {
        reject(new Error("grecaptcha no se inicializó correctamente"));
      }
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = onLoad;
      script.onerror = reject;
      document.body.appendChild(script);
    } else {
      onLoad();
    }
  });

  return window._grecaptchaPromise;
}
```

**Qué hace:**

Este módulo carga dinámicamente el script de la API de reCAPTCHA de Google (`api.js`). El parámetro `?render=explicit` le dice a Google que **no renderice el widget automáticamente** — el código lo hará manualmente llamando a `grecaptcha.render()`. Esto da control total sobre dónde y cuándo aparece el widget.

**El patrón singleton:**

La función guarda la promesa en `window._grecaptchaPromise`. Si `Recaptcha.jsx` se monta dos veces (por ejemplo, por hot reload en desarrollo), la segunda llamada reutiliza la promesa existente en lugar de insertar el script de Google por duplicado. Insertar el script dos veces causaría errores en el objeto `grecaptcha`.

**La espera con `grecaptcha.ready()`:**

El script de Google puede estar en el DOM pero aún no haber terminado de inicializar su API interna. `grecaptcha.ready(callback)` garantiza que la API está lista antes de devolver el objeto `grecaptcha`. Sin esta espera, llamar a `grecaptcha.render()` inmediatamente después de que el script carga puede fallar.

---

### 4.2 `Recaptcha.jsx` — el widget visual

**Ruta:** `src/components/Recaptcha.jsx`

```jsx
import React, { useEffect, useRef, useState } from "react";
import { loadRecaptcha } from "../utils/recaptchaLoader";

export default function Recaptcha({ siteKey }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const target = document.createElement("div");

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(target);
    }

    loadRecaptcha().then((grecaptcha) => {
      if (cancelled || !containerRef.current) return;

      const isMobile = window.innerWidth < 550;

      grecaptcha.render(target, {
        sitekey: siteKey,
        size: isMobile ? "compact" : "normal",
        callback: (token) => {
          const input = document.getElementById("g-recaptcha-response");
          if (input) input.value = token;
          window.__recaptchaVerified = true;
          window.dispatchEvent(new CustomEvent("recaptcha:verified", { detail: token }));
        },
        "expired-callback": () => {
          const input = document.getElementById("g-recaptcha-response");
          if (input) input.value = "";
          window.__recaptchaVerified = false;
          window.dispatchEvent(new CustomEvent("recaptcha:expired"));
        },
      });

      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [siteKey]);

  useEffect(() => {
    window.__recaptchaVerified = false;
  }, []);

  return (
    <div style={{ padding: "10px 0", display: "flex", justifyContent: "center", width: "100%", overflowX: "auto" }}>
      {!ready && <div>Cargando validación...</div>}
      <div ref={containerRef}></div>
    </div>
  );
}
```

**Qué hace con reCAPTCHA:**

Este componente es el único responsable de mostrar el widget y capturar el token. Recibe la `siteKey` como prop (que proviene de `PUBLIC_RECAPTCHA_SITE_KEY` en el entorno) y la pasa a `grecaptcha.render()`.

**`grecaptcha.render(target, opciones)`** — renderiza el widget de Google en el elemento DOM `target`. Las opciones clave son:

- `sitekey`: la clave pública que identifica tu sitio ante Google.
- `size`: `"normal"` (widget completo) o `"compact"` (versión reducida para móviles, activada cuando el ancho de pantalla es menor de 550 px).
- `callback`: función que Google llama **cuando el usuario completa el checkbox con éxito**. Recibe el **token** como argumento.
- `"expired-callback"`: función que Google llama cuando el token caduca (los tokens de reCAPTCHA v2 duran aproximadamente 2 minutos).

**Qué pasa cuando el usuario completa el reCAPTCHA:**

1. Google llama a `callback(token)`.
2. El token se escribe en `document.getElementById("g-recaptcha-response").value` — el input oculto del formulario que viajará al servidor en el POST.
3. Se actualiza `window.__recaptchaVerified = true` — una bandera global por si `SubmitButton` ya estaba montado antes de que el evento llegara.
4. Se dispara `window.dispatchEvent(new CustomEvent("recaptcha:verified", { detail: token }))` — el evento que `SubmitButton` escucha para activarse.

**Qué pasa cuando el token caduca:**

Google llama a `"expired-callback"`, que borra el valor del input oculto y dispara `recaptcha:expired`. `SubmitButton` vuelve a desactivarse, forzando al usuario a repetir la verificación.

**La flag `cancelled`:**

Protege contra condiciones de carrera en React Strict Mode o hot reload. Si el componente se desmonta antes de que `loadRecaptcha()` resuelva, `cancelled` evita que se intente renderizar el widget en un nodo que ya no está en el DOM.

---

### 4.3 `index.astro` — el formulario y el input oculto

**Ruta:** `src/pages/index.astro`

Las partes relevantes para reCAPTCHA:

```astro
---
import Recaptcha from '../components/Recaptcha.jsx';
import SubmitButton from '../components/SubmmitButton';
---

<form method="POST" action={actions.enviarCorreo} enctype="multipart/form-data">

  <!-- ... campos del formulario ... -->

  <Recaptcha
    client:only="react"
    siteKey={import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY}
  />
  <input type="hidden" id="g-recaptcha-response" name="g-recaptcha-response" />

  <SubmitButton client:only="react" />

</form>
```

**`client:only="react"`:**

Astro renderiza los componentes en el servidor por defecto. `client:only="react"` le dice a Astro que este componente **solo debe ejecutarse en el navegador**, nunca en el servidor. Esto es correcto porque reCAPTCHA necesita acceso al DOM y a `window`, que no existen en el servidor.

**`siteKey={import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY}`:**

La site key se lee desde las variables de entorno de Astro y se pasa como prop al componente. Al tener el prefijo `PUBLIC_`, Astro la incluye en el bundle del cliente, haciéndola accesible en el navegador. Las variables sin ese prefijo no estarían disponibles aquí.

**El input oculto:**

```html
<input type="hidden" id="g-recaptcha-response" name="g-recaptcha-response" />
```

Este campo es el puente entre el widget de reCAPTCHA (un componente React) y el formulario HTML estándar. Cuando `Recaptcha.jsx` obtiene un token, lo escribe en este input mediante `document.getElementById("g-recaptcha-response").value = token`. Al hacer submit, el navegador incluye este campo en el POST como cualquier otro campo del formulario.

> El nombre `g-recaptcha-response` es el nombre estándar que Google espera en sus integraciones automáticas. En este proyecto lo usamos manualmente porque el widget se renderiza de forma explícita (`render=explicit`).

---

### 4.4 `SubmmitButton.jsx` — el botón controlado por reCAPTCHA

**Ruta:** `src/components/SubmmitButton.jsx`

```jsx
import { useEffect, useState } from "react";

export default function SubmitButton() {
  const [enabled, setEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (window.__recaptchaVerified) {
      setEnabled(true);
    }

    const onVerified = () => setEnabled(true);
    const onExpired = () => setEnabled(false);

    window.addEventListener("recaptcha:verified", onVerified);
    window.addEventListener("recaptcha:expired", onExpired);

    return () => {
      window.removeEventListener("recaptcha:verified", onVerified);
      window.removeEventListener("recaptcha:expired", onExpired);
    };
  }, []);

  // ...
}
```

**Qué hace con reCAPTCHA:**

`SubmitButton` no interactúa con la API de Google directamente. Solo escucha los eventos del DOM que dispara `Recaptcha.jsx`:

- `recaptcha:verified` → activa el botón (`enabled = true`).
- `recaptcha:expired` → vuelve a desactivarlo (`enabled = false`).

**Por qué se comprueba `window.__recaptchaVerified` al montar:**

Los dos componentes son islands React independientes que se montan en momentos distintos. Si `SubmitButton` se monta después de que el usuario ya completó el reCAPTCHA (lo que puede ocurrir en navegaciones SPA o rehydrataciones), el evento `recaptcha:verified` ya pasó y no se puede capturar. La bandera `window.__recaptchaVerified` cubre ese caso: al montar el botón, si la verificación ya ocurrió, se activa directamente sin esperar el evento.

**Por qué el botón está desactivado por defecto:**

El estado inicial es `enabled = false`. Esto garantiza que aunque el usuario manipule el DOM o deshabilite JavaScript parcialmente, el formulario no puede enviarse sin pasar por la verificación. La validación real ocurre en el servidor (siguiente sección), pero desactivar el botón mejora la experiencia de usuario al dar retroalimentación visual inmediata.

---

### 4.5 `actions/index.ts` — verificación en el servidor

**Ruta:** `src/actions/index.ts`

```ts
// Extraer el token del formulario
const recaptchaToken = formData.get("g-recaptcha-response")?.toString() ?? "";

// Verificar con la API de Google
let recaptchaData: { success: boolean };
try {
  const recaptchaRes = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(import.meta.env.RECAPTCHA_SECRET)}&response=${encodeURIComponent(recaptchaToken)}`,
    }
  );
  recaptchaData = await recaptchaRes.json();
} catch (error) {
  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Error al verificar reCAPTCHA",
  });
}

// Rechazar si la verificación falló
if (!recaptchaData.success) {
  throw new ActionError({
    code: "BAD_REQUEST",
    message: "No se pudo verificar que seas humano",
  });
}
```

**Qué hace:**

Este es el paso crítico de seguridad. El servidor extrae el token que viajó en el campo `g-recaptcha-response` del formulario POST y lo envía a la API de verificación de Google junto con la **secret key**.

**La URL de verificación:**

```
POST https://www.google.com/recaptcha/api/siteverify
```

Con dos parámetros en el body:

| Parámetro | Valor |
|---|---|
| `secret` | Tu `RECAPTCHA_SECRET` — la clave privada |
| `response` | El token que el usuario envió en el formulario |

Google responde con un JSON del tipo:

```json
{ "success": true }
```

o en caso de error:

```json
{
  "success": false,
  "error-codes": ["invalid-input-response"]
}
```

**Por qué esto es la verdadera barrera de seguridad:**

La desactivación del botón en el cliente es una mejora de UX, no una barrera de seguridad. Cualquier usuario técnico puede hacer un `curl` directo al endpoint de la Action con datos arbitrarios, saltándose completamente el formulario y el widget. La verificación del servidor es la única garantía real: sin un token válido generado por Google para tu site key, la Action rechaza la petición con un error `BAD_REQUEST`.

**`import.meta.env.RECAPTCHA_SECRET`:**

Al no tener el prefijo `PUBLIC_`, Astro nunca incluye esta variable en el bundle del cliente. Solo está disponible en código que se ejecuta en el servidor (como los Astro Actions). Si intentaras usarla en un componente `.jsx` con `client:only`, el valor sería `undefined`.

---

## 5. Flujo completo del token

```
┌─────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                          │
│                                                                     │
│  1. index.astro se renderiza                                        │
│     └── pasa PUBLIC_RECAPTCHA_SITE_KEY como prop a Recaptcha.jsx   │
│                                                                     │
│  2. recaptchaLoader.js inserta el script de Google en el DOM       │
│     └── URL: api.js?render=explicit                                 │
│                                                                     │
│  3. Recaptcha.jsx llama a grecaptcha.render()                      │
│     └── con la siteKey recibida como prop                           │
│     └── Google renderiza el checkbox "No soy un robot"             │
│                                                                     │
│  4. El usuario hace clic en el checkbox                             │
│     └── Google ejecuta sus verificaciones internas                  │
│     └── Google llama a callback(token)                              │
│                                                                     │
│  5. Recaptcha.jsx recibe el token                                   │
│     ├── escribe el token en input#g-recaptcha-response             │
│     ├── pone window.__recaptchaVerified = true                      │
│     └── dispara CustomEvent("recaptcha:verified")                   │
│                                                                     │
│  6. SubmmitButton.jsx escucha "recaptcha:verified"                 │
│     └── activa el botón de enviar                                   │
│                                                                     │
│  7. El usuario hace clic en "Enviar mensaje"                        │
│     └── el formulario hace POST con todos los campos               │
│         incluyendo g-recaptcha-response = <token>                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │  POST multipart/form-data
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVIDOR (Astro Action — actions/index.ts)                         │
│                                                                     │
│  8. Se extrae el token del formData                                 │
│     └── formData.get("g-recaptcha-response")                        │
│                                                                     │
│  9. Se verifica el token con Google                                 │
│     └── POST https://www.google.com/recaptcha/api/siteverify       │
│         ├── secret = RECAPTCHA_SECRET (clave privada del servidor)  │
│         └── response = <token del usuario>                          │
│                                                                     │
│  10. Google responde { success: true } o { success: false }        │
│                                                                     │
│  11a. Si success = false → ActionError BAD_REQUEST                 │
│       └── index.astro muestra alerta de error                       │
│                                                                     │
│  11b. Si success = true → continúa con el envío del correo         │
│       └── index.astro muestra alerta de éxito                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Por qué el token solo se usa una vez

Los tokens de reCAPTCHA v2 tienen dos limitaciones de diseño importantes:

**Expiración temporal:** Google invalida el token aproximadamente **2 minutos** después de que se generó. Si el usuario tarda mucho en enviar el formulario después de completar el reCAPTCHA, el token ya no será válido cuando llegue al servidor. Por eso existe el `expired-callback` en `Recaptcha.jsx`: Google avisa cuando el token caduca, el widget se resetea y el usuario debe completarlo de nuevo.

**Uso único:** Una vez que el servidor envía el token a `api/siteverify` y Google responde `success: true`, ese token queda invalidado. No puede reutilizarse para enviar otro formulario. Esto impide que alguien intercepte el token de una petición legítima y lo reutilice en una petición automatizada.

---

## 7. Problemas frecuentes con reCAPTCHA

| Síntoma | Causa probable | Solución |
|---|---|---|
| El widget no aparece, solo "Cargando validación..." | `PUBLIC_RECAPTCHA_SITE_KEY` no está definida o es incorrecta | Comprueba el `.env` y reinicia el servidor de desarrollo |
| El widget carga pero el checkbox no funciona | `localhost` no está en los dominios autorizados en la consola de Google | Añade `localhost` en la consola de reCAPTCHA → tu sitio → configuración → Dominios |
| Error "No se pudo verificar que seas humano" | `RECAPTCHA_SECRET` incorrecta, o el token llegó vacío al servidor | Comprueba que el input hidden `g-recaptcha-response` tiene valor al enviar (inspecciona el network tab) |
| El botón de enviar nunca se activa | El evento `recaptcha:verified` no llega a `SubmitButton` | Abre la consola del navegador y comprueba si hay errores de JavaScript. Puede ser que el script de Google no cargó |
| Error "invalid-input-response" de Google | El token llegó corrupto o vacío | El formulario se envió sin esperar al callback. Verifica que el input oculto tiene valor antes del submit |
| El widget aparece dos veces | El script de Google se cargó dos veces | El singleton en `recaptchaLoader.js` previene esto; si ocurre, puede haber otro script de reCAPTCHA cargado manualmente en el Layout |
| En producción funciona el widget pero falla la verificación | El dominio de producción no está en la consola de Google | Añade el dominio en la consola de reCAPTCHA (sin `https://`, solo el dominio) |
