import { defineAction, ActionError } from "astro:actions";
import nodemailer from "nodemailer";
import 'dotenv/config';

export const server = {
  enviarCorreo: defineAction({
    accept: "form",
    handler: async (_formData, ctx) => {
      const formData = await ctx.request.formData();

      const nombre    = formData.get("nombre")?.toString();
      const email     = formData.get("email")?.toString();
      const asunto    = formData.get("asunto")?.toString();
      const mensaje   = formData.get("mensaje")?.toString();

      if (!nombre || !email || !asunto || !mensaje) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Faltan campos requeridos",
        });
      }

      const imagen = formData.get("imagen");
      let attachments: any[] = [];
      let notaImagen = "El usuario no ha adjuntado ninguna imagen.";
      const MAX_IMAGE_SIZE = 512 * 1024;

      if (imagen instanceof File && imagen.size > 0) {
        if (imagen.size > MAX_IMAGE_SIZE) {
          throw new ActionError({ code: "BAD_REQUEST", message: "La imagen no puede superar los 512 KB" });
        }
        if (!imagen.type.startsWith("image/")) {
          throw new ActionError({ code: "BAD_REQUEST", message: "Solo se permiten imágenes" });
        }
        const buffer = Buffer.from(await imagen.arrayBuffer());
        attachments.push({ filename: imagen.name, content: buffer, contentType: imagen.type });
        notaImagen = `El usuario ha adjuntado una imagen: ${imagen.name}`;
      }

      // Validar reCAPTCHA
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

      const destinatario = process.env.EMAIL_DESTINATARIO;
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        secure: false,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      try {
        await transporter.sendMail({
          from: `"Contacto - Recaptcha" <${process.env.EMAIL_FROM}>`,
          to: destinatario,
          subject: asunto,
          html: `
            <strong>Nombre:</strong><br />${nombre}<br /><br />
            <strong>Email:</strong><br />${email}<br /><br />
            <strong>Mensaje:</strong><br />${mensaje.replace(/\n/g, "<br />")}<br /><br />
            <strong>Imagen:</strong><br />${notaImagen}
          `,
          attachments,
        });
        return { success: true };
      } catch {
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo enviar el correo" });
      }
    },
  }),
};