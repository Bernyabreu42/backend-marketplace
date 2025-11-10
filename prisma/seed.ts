import {
  BlogPostStatus,
  DiscountType,
  PrismaClient,
  ProductStatus,
  PromotionType,
  StatusStore,
  TaxType,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { env } from "../src/config/env";
import { RolesEnum, UserStatusEnum } from "../src/core/enums";

const prisma = new PrismaClient();

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

async function safeFindOrCreate(model: any, where: any, data: any) {
  const existing = await model.findFirst({ where });
  if (existing) return existing;
  return await model.create({ data });
}

async function main() {
  const email = env.SEED_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const pwd = env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || !pwd)
    throw new Error("Faltan SEED_ADMIN_EMAIL o SEED_ADMIN_PASSWORD");

  const hash = await bcrypt.hash(pwd, 12);

  // --- Usuarios ---
  const usersSeed = [
    {
      email,
      firstName: "Berny Willy",
      lastName: "Abreu Bautista",
      phone: "8294602725",
      username: "Berny Abreu",
      role: RolesEnum.ADMIN,
    },
    {
      email: "buyer@gmail.com",
      firstName: "Comprador",
      lastName: "",
      phone: "0000000000",
      username: "",
      role: RolesEnum.BUYER,
    },
    {
      email: "support@gmail.com",
      firstName: "Berny Willy",
      lastName: "Abreu Bautista",
      phone: "8294602725",
      username: "Berny Abreu",
      role: RolesEnum.SUPPORT,
    },
    {
      email: "seller@gmail.com",
      firstName: "Vendedor",
      lastName: "",
      phone: "0000000000",
      username: "",
      role: RolesEnum.SELLER,
    },
  ];

  for (const u of usersSeed) {
    const normalizedEmail = u.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (!existing) {
      await prisma.user.create({
        data: {
          ...u,
          email: normalizedEmail,
          password: hash,
          status: UserStatusEnum.ACTIVE,
          emailVerified: true,
        },
      });
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password: hash },
      });
    }
  }

  const seller = await prisma.user.findFirst({
    where: { email: "seller@gmail.com" },
  });
  if (!seller) throw new Error("No se pudo crear el usuario vendedor.");

  // --- Tienda del vendedor ---
  const sellerStore = await safeFindOrCreate(
    prisma.store,
    { ownerId: seller.id },
    {
      ownerId: seller.id,
      name: "CommerceHub Central",
      tagline: "Todo lo que necesitas en un solo lugar",
      description:
        "Tienda principal del marketplace con una selección curada de productos para el hogar, electrónica, moda y más.",
      email: seller.email,
      phone: "809-555-0101",
      address: {
        country: "Dominican Republic",
        city: "Santo Domingo",
        state: "Distrito Nacional",
        postalCode: "10101",
        street: "Avenida 21 de Abril",
        note: "Cerca del Centro Colonial (Patrimonio de la Humanidad)",
      },
      status: StatusStore.active,
      keywords: "electronica, hogar, moda, deportes",
      metaTitle: "CommerceHub Central",
      metaDesc: "Tienda semilla del marketplace CommerceHub",
      businessHours: [
        { day: "monday", open: "09:00", close: "18:00" },
        { day: "tuesday", open: "09:00", close: "18:00" },
        { day: "wednesday", open: "09:00", close: "18:00" },
        { day: "thursday", open: "09:00", close: "18:00" },
        { day: "friday", open: "09:00", close: "18:00" },
        { day: "saturday", open: "10:00", close: "1400" },
        { day: "sunday", open: "00:00", close: "00:00", closed: true },
      ],
    }
  );
  // --- Métodos de envío ---
  const shippingMethodsSeed = [
    {
      name: "Envío Estándar",
      description: "Entrega en 3-5 días hábiles.",
      cost: 250.0,
    },
    {
      name: "Envío Express",
      description: "Entrega en 1-2 días hábiles.",
      cost: 500.0,
    },
    {
      name: "Recogida en Tienda",
      description: "Gratis. Disponible en 24 horas.",
      cost: 0,
    },
  ];

  for (const method of shippingMethodsSeed) {
    await safeFindOrCreate(
      prisma.shippingMethod,
      { name: method.name, storeId: sellerStore.id },
      { ...method, storeId: sellerStore.id }
    );
  }

  // --- Cuentas de lealtad ---
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const { id } of allUsers) {
    await safeFindOrCreate(
      prisma.loyaltyAccount,
      { userId: id },
      { userId: id }
    );
  }

  // --- Categorías ---
  const categoryNames = [
    "Electrónica",
    "Moda y Accesorios",
    "Hogar y Cocina",
    "Salud y Belleza",
    "Deportes y Fitness",
    "Juguetes y Bebés",
    "Automotriz",
    "Libros y Entretenimiento",
    "Mascotas",
    "Ferretería y Herramientas",
  ];
  for (const name of categoryNames) {
    await safeFindOrCreate(
      prisma.category,
      { slug: slugify(name) },
      { name, slug: slugify(name) }
    );
  }
  const categories = await prisma.category.findMany();

  // --- Impuestos ---
  const taxesSeed = [
    {
      name: "IVA General",
      type: TaxType.percentage,
      rate: 18,
      description: "Impuesto al valor agregado general",
    },
    {
      name: "Impuesto selectivo a bebidas",
      type: TaxType.percentage,
      rate: 10,
      description: "Impuesto selectivo para bebidas azucaradas",
    },
    {
      name: "Tarifa logística",
      type: TaxType.fixed,
      rate: 150,
      description: "Tarifa fija por manejo y logística",
    },
  ];
  for (const tax of taxesSeed) {
    await safeFindOrCreate(
      prisma.tax,
      { name: tax.name, storeId: sellerStore.id },
      { ...tax, status: "active", storeId: sellerStore.id }
    );
  }
  const taxes = await prisma.tax.findMany({
    where: { storeId: sellerStore.id },
  });

  // --- Descuentos ---
  const discountsSeed = [
    {
      name: "Descuento de bienvenida",
      type: DiscountType.percentage,
      value: 10,
      description: "Aplica a la primera compra",
    },
    {
      name: "Liquidación de temporada",
      type: DiscountType.fixed,
      value: 500,
      description: "Descuento fijo para artículos seleccionados",
    },
  ];
  for (const discount of discountsSeed) {
    await safeFindOrCreate(
      prisma.discount,
      { name: discount.name, storeId: sellerStore.id },
      { ...discount, status: "active", storeId: sellerStore.id }
    );
  }

  // --- Promociones ---
  const now = new Date();
  const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const promotionsSeed = [
    {
      name: "Promo de verano",
      type: PromotionType.coupon,
      value: 15,
      code: "VERANO15",
      description: "Cupón válido para compras superiores a $1500",
      startsAt: now,
      endsAt: inThirtyDays,
    },
    {
      name: "2x1 en juguetes",
      type: PromotionType.automatic,
      description: "Compra dos juguetes y paga uno",
      startsAt: now,
      endsAt: inThirtyDays,
    },
  ];
  for (const promo of promotionsSeed) {
    await safeFindOrCreate(
      prisma.promotion,
      { name: promo.name, storeId: sellerStore.id },
      { ...promo, status: "active", storeId: sellerStore.id }
    );
  }

  // --- Productos ---
  const discountToApply = await prisma.discount.findFirst({
    where: { name: "Liquidación de temporada" },
  });
  const baseProducts = [
    {
      name: 'Laptop Pro 15"',
      price: 125000,
      categories: ["electronica", "hogar-y-cocina"],
      description:
        "Laptop profesional con pantalla de 15 pulgadas, 16GB de RAM, 512GB SSD y teclado retroiluminado.",
      images: [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80",
      ],
    },
    {
      name: "Smartwatch Pro",
      price: 15000,
      categories: ["electronica", "deportes-y-fitness"],
      description:
        "Reloj inteligente con GPS, monitor de ritmo cardíaco y notificaciones.",
      images: [
        "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1200&q=80",
      ],
    },
    {
      name: "Camiseta de Algodón Orgánico",
      price: 2500,
      discountId: discountToApply?.id,
      categories: ["moda-y-accesorios"],
      description: "Camiseta suave y cómoda, hecha con 100% algodón orgánico.",
      images: [
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
      ],
    },
  ];

  for (const product of baseProducts) {
    const exists = await prisma.product.findFirst({
      where: { name: product.name },
    });
    if (!exists) {
      const connectedCategories = categories
        .filter((c) => product.categories.includes(c.slug))
        .map((c) => ({ id: c.id }));
      let priceFinal = product.price;
      if (product.discountId && discountToApply) {
        priceFinal =
          discountToApply.type === "fixed"
            ? product.price - discountToApply.value
            : product.price - (product.price * discountToApply.value) / 100;
      }

      await prisma.product.create({
        data: {
          ...product,
          priceFinal,
          stock: 50,
          status: ProductStatus.active,
          storeId: sellerStore.id,
          categories: { connect: connectedCategories },
          taxes: { create: taxes.slice(0, 1).map((t) => ({ taxId: t.id })) },
        },
      });
    }
  }

  // --- Favoritos de ejemplo ---
  const buyer = await prisma.user.findFirst({
    where: { email: "buyer@gmail.com" },
  });

  if (buyer) {
    const addressSeed = [
      {
        label: "Casa",
        isDefault: true,
        address: {
          country: "Dominican Republic",
          state: "Distrito Nacional",
          city: "Santo Domingo",
          postalCode: "10101",
          street: "Calle Las Palmeras #123",
          note: "Portón azul. Favor tocar dos veces.",
        },
      },
      {
        label: "Oficina",
        isDefault: false,
        address: {
          country: "Dominican Republic",
          state: "Distrito Nacional",
          city: "Santo Domingo",
          postalCode: "10112",
          street: "Av. Winston Churchill 45, Torre B, Piso 7",
          note: "Recepción solicita documento de identidad.",
        },
      },
    ];

    let defaultAddressId: string | null = null;

    for (const payload of addressSeed) {
      const found = await prisma.userAddress.findFirst({
        where: { userId: buyer.id, label: payload.label ?? null },
      });

      if (found) {
        const updated = await prisma.userAddress.update({
          where: { id: found.id },
          data: {
            address: payload.address,
            isDefault: payload.isDefault,
          },
        });
        if (updated.isDefault) {
          defaultAddressId = updated.id;
        }
      } else {
        const created = await prisma.userAddress.create({
          data: {
            userId: buyer.id,
            label: payload.label,
            address: payload.address,
            isDefault: payload.isDefault,
          },
        });
        if (created.isDefault) {
          defaultAddressId = created.id;
        }
      }
    }

    if (defaultAddressId) {
      await prisma.userAddress.updateMany({
        where: {
          userId: buyer.id,
          id: { not: defaultAddressId },
        },
        data: { isDefault: false },
      });
    } else {
      const firstAddress = await prisma.userAddress.findFirst({
        where: { userId: buyer.id },
        orderBy: { createdAt: "asc" },
      });
      if (firstAddress) {
        await prisma.userAddress.update({
          where: { id: firstAddress.id },
          data: { isDefault: true },
        });
      }
    }

    const sampleProducts = await prisma.product.findMany({
      orderBy: { createdAt: "asc" },
      take: 2,
    });

    for (const product of sampleProducts) {
      const favoriteExists = await prisma.favorite.findFirst({
        where: { userId: buyer.id, productId: product.id },
      });

      if (!favoriteExists) {
        await prisma.favorite.create({
          data: {
            userId: buyer.id,
            productId: product.id,
          },
        });

        await prisma.product.update({
          where: { id: product.id },
          data: { favoritesCount: { increment: 1 } },
        });
      }
    }
  }

  console.log("✅ Seed completado sin duplicados.");
}

main()
  .catch((err) => {
    console.error("❌ Error en seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
