import nodemailer from "nodemailer";

import { env } from "../../config/env";
import { renderTemplate } from "../../utils/render-template";

interface SendEmailProps {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

const createTransporter = () => {
  if (!env.MAIL_USER || !env.MAIL_PASS) {
    return null;
  }

  try {
    if (env.MAIL_HOST) {
      const transportOptions: nodemailer.TransportOptions = {
        host: env.MAIL_HOST,
        port: env.MAIL_PORT ?? 587,
        secure:
          env.MAIL_SECURE ??
          (typeof env.MAIL_PORT === "number" ? env.MAIL_PORT === 465 : false),
        auth: {
          user: env.MAIL_USER,
          pass: env.MAIL_PASS,
        },
      };

      if (typeof env.MAIL_IGNORE_TLS === "boolean") {
        transportOptions.ignoreTLS = env.MAIL_IGNORE_TLS;
      }

      if (typeof env.MAIL_REQUIRE_TLS === "boolean") {
        transportOptions.requireTLS = env.MAIL_REQUIRE_TLS;
      }

      return nodemailer.createTransport(transportOptions);
    }

    return nodemailer.createTransport({
      service: env.MAIL_SERVICE ?? "gmail",
      auth: {
        user: env.MAIL_USER,
        pass: env.MAIL_PASS,
      },
    });
  } catch (error) {
    console.error("Failed to initialize mail transporter:", error);
    return null;
  }
};

const transporter = createTransporter();

if (!env.MAIL_USER || !env.MAIL_PASS) {
  console.warn(
    "Mail credentials are not configured. Emails will not be sent."
  );
} else if (!transporter) {
  console.warn(
    "Mail transporter could not be initialised. Emails may fail to send."
  );
}

export const mailService = async ({
  to,
  subject,
  template,
  data,
}: SendEmailProps) => {
  if (!transporter) {
    return;
  }

  const html = renderTemplate(template, data);

  try {
    await transporter.sendMail({
      from: env.MAIL_FROM ?? env.MAIL_USER ?? "CommerceHub",
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send email:", error);
    if (typeof error === "object" && error && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "EAUTH") {
        console.error(
          "Email authentication failed. Verify MAIL_USER/MAIL_PASS or use an app-specific password if your provider requires it."
        );
      }
    }
  }
};
