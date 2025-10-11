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

async function main() {
  const email = env.SEED_ADMIN_EMAIL ?? "";
  const pwd = env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || !pwd) {
    throw new Error(
      "SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben estar definidos en el entorno"
    );
  }

  const hash = await bcrypt.hash(pwd, 12);

  await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: {
      firstName: "Berny Willy",
      lastName: "Abreu Bautista",
      phone: "8294602725",
      username: "Berny Abreu",
      email: email.trim().toLowerCase(),
      password: hash,
      role: RolesEnum.ADMIN,
      status: UserStatusEnum.ACTIVE,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: {
      firstName: "Comprador",
      lastName: "",
      phone: "0000000000",
      username: "",
      email: "buyer@gmail.com",
      password: hash,
      role: RolesEnum.BUYER,
      status: UserStatusEnum.ACTIVE,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: {
      firstName: "Berny Willy",
      lastName: "Abreu Bautista",
      phone: "8294602725",
      username: "Berny Abreu",
      email: "support@gmail.com",
      password: hash,
      role: RolesEnum.SUPPORT,
      status: UserStatusEnum.ACTIVE,
      emailVerified: true,
    },
  });

  const seller = await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: {
      firstName: "Vendedor",
      lastName: "",
      phone: "0000000000",
      username: "",
      email: "seller@gmail.com",
      password: hash,
      role: RolesEnum.SELLER,
      status: UserStatusEnum.ACTIVE,
      emailVerified: true,
    },
  });

  const sellerStore = await prisma.store.upsert({
    where: { ownerId: seller.id },
    update: {},
    create: {
      ownerId: seller.id,
      name: "CommerceHub Central",
      tagline: "Todo lo que necesitas en un solo lugar",
      description:
        "Tienda principal del marketplace con una selección curada de productos para el hogar, electrónica, moda y más.",
      email: seller.email,
      phone: "809-555-0101",
      address: "Av. Principal 123, Ciudad Central",
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
        { day: "saturday", open: "10:00", close: "14:00" },
        { day: "sunday", open: "00:00", close: "00:00", closed: true },
      ],
    },
    select: { id: true },
  });

  // --- Crear métodos de envío para la tienda semilla ---
  console.log("Creando métodos de envío para la tienda semilla...");
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
    const existingMethod = await prisma.shippingMethod.findFirst({
      where: {
        name: method.name,
        storeId: sellerStore.id,
      },
    });

    if (!existingMethod) {
      await prisma.shippingMethod.create({
        data: {
          ...method,
          storeId: sellerStore.id,
        },
      });
    }
  }

  // --- Crear cuentas de lealtad para todos los usuarios ---
  const allUsersForLoyalty = await prisma.user.findMany({
    select: { id: true },
  });
  for (const { id } of allUsersForLoyalty) {
    await prisma.loyaltyAccount.upsert({
      where: { userId: id },
      update: {},
      create: { userId: id },
    });
  }

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

  await prisma.category.createMany({
    data: categoryNames.map((name) => ({ name, slug: slugify(name) })),
    skipDuplicates: true,
  });

  const categories = await prisma.category.findMany({
    where: { slug: { in: categoryNames.map((name) => slugify(name)) } },
    select: { id: true, slug: true },
  });

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

  const taxes: Array<{ id: string }> = [];
  for (const tax of taxesSeed) {
    const existing = await prisma.tax.findFirst({
      where: { name: tax.name, storeId: sellerStore.id },
      select: { id: true },
    });

    if (existing) {
      taxes.push(existing);
      continue;
    }

    const created = await prisma.tax.create({
      data: {
        ...tax,
        status: "active",
        storeId: sellerStore.id,
      },
      select: { id: true },
    });

    taxes.push(created);
  }

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
    const exists = await prisma.discount.findFirst({
      where: { name: discount.name, storeId: sellerStore.id },
      select: { id: true },
    });

    if (exists) continue;

    await prisma.discount.create({
      data: {
        ...discount,
        status: "active",
        storeId: sellerStore.id,
      },
    });
  }

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
    const exists = await prisma.promotion.findFirst({
      where: { name: promo.name, storeId: sellerStore.id },
      select: { id: true },
    });

    if (exists) {
      await prisma.promotion.update({
        where: { id: exists.id },
        data: {
          type: promo.type,
          value: promo.value ?? null,
          code: promo.code ?? null,
          description: promo.description,
          startsAt: promo.startsAt,
          endsAt: promo.endsAt,
        },
      });
      continue;
    }

    await prisma.promotion.create({
      data: {
        ...promo,
        value: promo.value ?? null,
        code: promo.code ?? null,
        status: "active",
        storeId: sellerStore.id,
      },
    });
  }

  const productExists = await prisma.product.findFirst({
    where: { name: 'Laptop Pro 15"' },
  });

  if (!productExists) {
    const productCategories = categories
      .filter((category) =>
        ["electronica", "hogar-y-cocina"].includes(category.slug)
      )
      .map((category) => ({ id: category.id }));

    await prisma.product.create({
      data: {
        name: 'Laptop Pro 15"',
        description:
          "Laptop profesional con pantalla de 15 pulgadas, 16GB de RAM, 512GB SSD y teclado retroiluminado.",
        price: 125000,
        priceFinal: 125000,
        stock: 25,
        images: [
          "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1200&q=80",
        ],
        status: ProductStatus.active,
        storeId: sellerStore.id,
        categories: {
          connect: productCategories,
        },
        taxes: {
          create: taxes.slice(0, 2).map((tax) => ({ taxId: tax.id })),
        },
      },
    });
  }

  // --- Añadir 2 productos más ---

  // Producto 2: Smartwatch
  const smartwatchExists = await prisma.product.findFirst({
    where: { name: "Smartwatch Pro" },
  });

  if (!smartwatchExists) {
    const smartwatchCategories = categories
      .filter((category) =>
        ["electronica", "deportes-y-fitness"].includes(category.slug)
      )
      .map((category) => ({ id: category.id }));

    await prisma.product.create({
      data: {
        name: "Smartwatch Pro",
        description:
          "Reloj inteligente con GPS, monitor de ritmo cardíaco y notificaciones.",
        price: 15000,
        priceFinal: 15000,
        stock: 50,
        images: [
          "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1200&q=80",
        ],
        status: ProductStatus.active,
        storeId: sellerStore.id,
        categories: {
          connect: smartwatchCategories,
        },
        taxes: {
          create: [{ taxId: taxes[0].id }], // IVA General
        },
      },
    });
  }

  // Producto 3: Camiseta con descuento
  const tshirtExists = await prisma.product.findFirst({
    where: { name: "Camiseta de Algodón Orgánico" },
  });

  if (!tshirtExists) {
    const tshirtCategories = categories
      .filter((category) => ["moda-y-accesorios"].includes(category.slug))
      .map((category) => ({ id: category.id }));

    // Aplicar un descuento existente
    const discountToApply = await prisma.discount.findFirst({
      where: { name: "Liquidación de temporada" },
    });

    let finalPrice = 2500;
    let discountId: string | undefined = undefined;

    if (discountToApply) {
      discountId = discountToApply.id;
      if (discountToApply.type === "fixed") {
        finalPrice = 2500 - discountToApply.value;
      } else if (discountToApply.type === "percentage") {
        finalPrice = 2500 - (2500 * discountToApply.value) / 100;
      }
    }

    await prisma.product.create({
      data: {
        name: "Camiseta de Algodón Orgánico",
        description:
          "Camiseta suave y cómoda, hecha con 100% algodón orgánico.",
        price: 2500,
        priceFinal: finalPrice,
        stock: 120,
        images: [
          "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
        ],
        status: ProductStatus.active,
        storeId: sellerStore.id,
        discountId: discountId,
        categories: {
          connect: tshirtCategories,
        },
      },
    });
  }

  console.log("Creando reseñas de productos semilla...");

  const buyerForReviews = await prisma.user.findUnique({
    where: { email: "buyer@gmail.com" },
    select: { id: true },
  });

  if (buyerForReviews) {
    const productsForReviews = await prisma.product.findMany({
      where: { name: { in: ['Laptop Pro 15"', "Smartwatch Pro"] } },
      select: { id: true, name: true, storeId: true },
    });

    const reviewSeeds = [
      {
        productName: 'Laptop Pro 15"',
        rating: 5,
        comment:
          "Excelente rendimiento y calidad de construcción. Ideal para trabajo y entretenimiento.",
      },
      {
        productName: "Smartwatch Pro",
        rating: 4,
        comment:
          "Muy práctico para el día a día. La batería podría durar un poco más, pero cumple.",
      },
    ];

    for (const seed of reviewSeeds) {
      const product = productsForReviews.find(
        (item) => item.name === seed.productName
      );

      if (!product) continue;

      const existingReview = await prisma.review.findFirst({
        where: {
          userId: buyerForReviews.id,
          productId: product.id,
        },
      });

      if (existingReview) continue;

      await prisma.review.create({
        data: {
          rating: seed.rating,
          comment: seed.comment,
          productId: product.id,
          storeId: product.storeId,
          userId: buyerForReviews.id,
        },
      });
    }
  }

  // --- Crear una orden para el usuario comprador ---
  const orderExists = await prisma.order.findFirst({
    where: {
      user: {
        email: "buyer@gmail.com",
      },
    },
  });

  const loyaltyActionsSeed = [
    {
      key: "purchase",
      name: "Compra en la tienda",
      description: "Otorga puntos por cada peso gastado",
      defaultPoints: 1,
    },
    {
      key: "social_follow",
      name: "Seguimiento en redes sociales",
      description: "Bonifica a clientes que siguen las cuentas oficiales",
      defaultPoints: 200,
    },
    {
      key: "manual_adjustment",
      name: "Ajuste manual",
      description:
        "Permite otorgar puntos adicionales segun criterio del administrador",
      defaultPoints: 0,
    },
  ];

  for (const action of loyaltyActionsSeed) {
    await prisma.loyaltyAction.upsert({
      where: { key: action.key },
      update: {
        name: action.name,
        description: action.description,
        defaultPoints: action.defaultPoints,
        isActive: true,
      },
      create: action,
    });
  }

  if (!orderExists) {
    console.log("Creando orden de prueba para el comprador...");
    const buyerUser = await prisma.user.findUnique({
      where: { email: "buyer@gmail.com" },
    });
    const smartwatch = await prisma.product.findFirst({
      where: { name: "Smartwatch Pro" },
      include: { discount: true },
    });
    const tshirt = await prisma.product.findFirst({
      where: { name: "Camiseta de Algodón Orgánico" },
      include: { discount: true },
    });

    if (buyerUser && smartwatch && tshirt) {
      const orderItems = [
        { product: smartwatch, quantity: 1 },
        { product: tshirt, quantity: 2 },
      ];

      const orderItemSnapshots = orderItems.map((item) => {
        const unitPrice = item.product.price ?? 0;
        const unitPriceFinal = item.product.priceFinal ?? unitPrice;
        const lineSubtotal = unitPrice * item.quantity;
        const lineDiscount =
          Math.max(unitPrice - unitPriceFinal, 0) * item.quantity;

        return {
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice,
          unitPriceFinal,
          lineSubtotal,
          lineDiscount,
        };
      });

      const subtotal = orderItemSnapshots.reduce(
        (acc, item) => acc + item.lineSubtotal,
        0
      );
      const productDiscountTotal = orderItemSnapshots.reduce(
        (acc, item) => acc + item.lineDiscount,
        0
      );
      const discountAdjustments = new Map<
        string,
        { type: string; name: string; amount: number; discountId?: string }
      >();
      for (const snapshot of orderItemSnapshots) {
        if (snapshot.lineDiscount > 0) {
          const matchingProduct = orderItems.find(
            (entry) => entry.product.id === snapshot.productId
          );
          const appliedDiscount = matchingProduct?.product.discount;
          if (appliedDiscount) {
            const key = appliedDiscount.id;
            const current = discountAdjustments.get(key) ?? {
              type: "discount",
              name: appliedDiscount.name,
              amount: 0,
              discountId: appliedDiscount.id,
            };
            current.amount += snapshot.lineDiscount;
            discountAdjustments.set(key, current);
          }
        }
      }

      // Aplicar la promoción "Promo de verano" (cupón) si existe
      const summerPromo = await prisma.promotion.findFirst({
        where: { name: "Promo de verano", type: PromotionType.coupon },
      });

      const promotionDiscount =
        summerPromo?.value && summerPromo.value > 0
          ? (subtotal * summerPromo.value) / 100
          : 0;
      const taxAmount = 0; // Simulado
      const shippingAmount = 0; // Simulado
      const totalDiscountAmount = productDiscountTotal + promotionDiscount;
      const total = subtotal - totalDiscountAmount + taxAmount + shippingAmount;

      const priceAdjustments: Array<Record<string, unknown>> = [
        ...discountAdjustments.values(),
      ];
      if (promotionDiscount > 0 && summerPromo) {
        priceAdjustments.push({
          type: "promotion",
          name: summerPromo.name,
          code: summerPromo.code ?? undefined,
          amount: promotionDiscount,
        });
      }

      // Transacción para crear orden y generar puntos
      await prisma.$transaction(async (tx) => {
        // Primero, obtenemos la cuenta de lealtad del comprador
        const loyaltyAccount = await tx.loyaltyAccount.findUnique({
          where: { userId: buyerUser.id },
        });

        const order = await tx.order.create({
          data: {
            userId: buyerUser.id,
            storeId: sellerStore.id,
            subtotal,
            totalDiscountAmount,
            taxAmount,
            shippingAmount,
            total: total,
            status: "completed", // Marcar como completada para el ejemplo
            shippingAddress: {
              street: "Calle Falsa 123",
              city: "Springfield",
              country: "USA",
            },
            shippingMethod: "Envío Estándar",
            promotionId: summerPromo?.id,
            promotionCodeUsed:
              promotionDiscount > 0 && summerPromo?.code
                ? summerPromo.code
                : undefined,
            priceAdjustments: priceAdjustments.length
              ? priceAdjustments
              : undefined,
            items: {
              create: orderItemSnapshots,
            },
          },
        });

        // Generar puntos de lealtad por la compra
        const purchaseAction = await tx.loyaltyAction.findUnique({
          where: { key: "purchase" },
        });
        const pointsPerUnit = purchaseAction?.defaultPoints ?? 1;
        const pointsEarned = Math.floor(total * pointsPerUnit);

        await tx.loyaltyTransaction.create({
          data: {
            accountId: loyaltyAccount!.id, // Usamos el ID correcto de la cuenta de lealtad
            userId: buyerUser.id,
            actionId: purchaseAction?.id,
            points: pointsEarned,
            referenceId: order.id,
            referenceType: "Order",
            description: `Puntos por orden #${order.id.substring(0, 8)}`,
          },
        });

        await tx.loyaltyAccount.update({
          where: { userId: buyerUser.id },
          data: {
            balance: { increment: pointsEarned },
            lifetimeEarned: { increment: pointsEarned },
          },
        });
      });
    }
  }

  console.log("Creando publicaciones de blog semilla...");

  const adminUser = await prisma.user.findFirst({
    where: { role: RolesEnum.ADMIN },
    select: { id: true },
  });

  if (adminUser) {
    const blogPostsSeed = [
      {
        title: "Bienvenido a CommerceHub",
        excerpt: "Resumen del lanzamiento y pilares del marketplace.",
        content:
          "CommerceHub reune vendedores y compradores en un mismo lugar." +
          "\n\nEn este espacio compartimos noticias, lanzamientos y buenas practicas.",
        coverImage:
          "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80",
        tags: ["novedades", "comunidad"],
      },
      {
        title: "Guia rapida para nuevos vendedores",
        excerpt:
          "Lista de acciones para publicar productos y gestionar ordenes.",
        content:
          "Sigue estos pasos para preparar tu tienda y optimizar listados." +
          "\n\n1. Completa la informacion de tu tienda." +
          "\n2. Sube imagenes optimizadas." +
          "\n3. Revisa tus ordenes en el panel de control.",
        coverImage:
          "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
        tags: ["vendedores", "tutorial"],
      },
    ];

    for (const post of blogPostsSeed) {
      const slug = slugify(post.title);
      const publishedAt = new Date();
      await prisma.blogPost.upsert({
        where: { slug },
        update: {
          title: post.title,
          excerpt: post.excerpt,
          content: post.content,
          coverImage: post.coverImage ?? null,
          status: BlogPostStatus.published,
          tags: post.tags ?? [],
          publishedAt,
          authorId: adminUser.id,
        },
        create: {
          title: post.title,
          slug,
          excerpt: post.excerpt,
          content: post.content,
          coverImage: post.coverImage ?? null,
          status: BlogPostStatus.published,
          tags: post.tags ?? [],
          publishedAt,
          authorId: adminUser.id,
        },
      });
    }
  }

  console.log("Seed data listo");
}

main()
  .catch((error) => {
    console.error("Seed falló", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
