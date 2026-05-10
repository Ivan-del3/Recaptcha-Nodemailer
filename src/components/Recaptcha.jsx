import React, { useEffect, useRef, useState } from "react";
import { loadRecaptcha } from "../utils/recaptchaLoader";

export default function Recaptcha({ siteKey }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadRecaptcha().then((grecaptcha) => {
      if (cancelled || !containerRef.current) return;

      grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          const input = document.getElementById("g-recaptcha-response");
          if (input) input.value = token;

          window.__recaptchaVerified = true;

          window.dispatchEvent(
            new CustomEvent("recaptcha:verified", { detail: token })
          );
        },
      });

      setReady(true);
    });

    return () => { cancelled = true; };
  }, [siteKey]);

  useEffect(()=>{
    window.__recaptchaVerified = false;
  },[])

  return (
    <div style={{ padding: "10px" }}>
      {!ready && <div>Cargando validación...</div>}
      <div ref={containerRef}></div>
    </div>
  );
}
