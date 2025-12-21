import { userPublicSelect } from "../users/SchemaPublic";

export const reviewPublicSelect = {
  id: true,
  rating: true,
  comment: true,
  productId: true,
  storeId: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      images: true,
    },
  },
  store: {
    select: {
      id: true,
      name: true,
    },
  },
  user: {
    select: userPublicSelect,
  },
} as const;
