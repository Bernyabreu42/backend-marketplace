import prisma from "../../../database/prisma";

export const findFavoriteProductIds = async (
  userId: string,
  productIds: string[]
) => {
  if (!userId || productIds.length === 0) return new Set<string>();

  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      productId: { in: productIds },
    },
    select: { productId: true },
  });

  return new Set(favorites.map((favorite) => favorite.productId));
};
