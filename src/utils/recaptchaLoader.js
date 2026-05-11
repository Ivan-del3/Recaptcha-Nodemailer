// Exportamos la función que llamaremos desde otros archivos
// Carga el script de recaptcha una sola vez
export function loadRecaptcha() {

  // Si ya hay una promesa, return (SINGLETON)
  if (window._grecaptchaPromise) return window._grecaptchaPromise;

  // Creamos la promesa y la guardamos en window para que persista.
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

// Inserta el script de Google en el DOM para poder usar su API
