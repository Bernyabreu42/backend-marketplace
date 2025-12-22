import { StatusStore } from "@prisma/client";

import { env } from "../../config/env";
import { mailService } from "./mailService";

const buildOwnerName = (firstName?: string | null, fallback?: string | null) => {
  if (firstName && firstName.trim().length > 0) return firstName.trim();
  if (fallback && fallback.trim().length > 0) return fallback.trim();
  return "Socio";
};

const dashboardLink = () => {
  const base = env.CLIENT_URL ?? "https://commercehub.localhost";
  return `${base.replace(/\/$/, "")}/dashboard/store`;
};

export const notifyStoreCreated = async (params: {
  to: string | null | undefined;
  firstName?: string | null;
  fallbackName?: string | null;
  storeName: string;
}) => {
  if (!params.to) return;

  await mailService({
    to: params.to,
    subject: "Recibimos la creación de tu tienda",
    template: "store-created",
    data: {
      ownerName: buildOwnerName(params.firstName, params.fallbackName),
      storeName: params.storeName,
      dashboardUrl: dashboardLink(),
    },
  });
};

const STATUS_COPY: Record<
  StatusStore,
  { label: string; message: string }
> = {
  pending: {
    label: "Pendiente de revisión",
    message:
      "Nuestro equipo está validando la información. Te avisaremos apenas tengas novedades.",
  },
  active: {
    label: "Activa",
    message:
      "¡Tu tienda ya está visible para los clientes! Puedes gestionar productos y pedidos desde tu panel.",
  },
  inactive: {
    label: "Inactiva",
    message:
      "La tienda fue pausada. Revisa tu panel para reactivarla o completa los requisitos solicitados.",
  },
  banned: {
    label: "Suspendida",
    message:
      "La tienda fue suspendida por el equipo de moderación. Contáctanos para conocer los pasos a seguir.",
  },
  deleted: {
    label: "Eliminada",
    message:
      "La tienda fue eliminada del marketplace. Si esto fue un error, comunícate con soporte.",
  },
};

export const notifyStoreStatusChange = async (params: {
  to: string | null | undefined;
  firstName?: string | null;
  fallbackName?: string | null;
  storeName: string;
  status: StatusStore;
}) => {
  if (!params.to) return;

  const copy = STATUS_COPY[params.status];

  await mailService({
    to: params.to,
    subject: `Actualización del estado de tu tienda ${params.storeName}`,
    template: "store-status-update",
    data: {
      ownerName: buildOwnerName(params.firstName, params.fallbackName),
      storeName: params.storeName,
      statusLabel: copy.label,
      statusMessage: copy.message,
      dashboardUrl: dashboardLink(),
    },
  });
};
