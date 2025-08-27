import nodemailer from "nodemailer";
import { renderTemplate } from "../../utils/render-template";

interface sendEmailProps {
  to: string;
  subject: string;
  template: string; // nombre del archivo .hbs
  data: Record<string, any>; // datos que se inyectarán en la plantilla
}

const transporter = nodemailer.createTransport({
  service: "gmail", // o smtp personalizado
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export const mailService = async ({
  to,
  subject,
  template,
  data,
}: sendEmailProps) => {
  const html = renderTemplate(template, data);

  try {
    await transporter.sendMail({
      from: "CommerceHub",
      to,
      subject,
      html,
    });
  } catch (error) {
    console.log(error);
  }
};
