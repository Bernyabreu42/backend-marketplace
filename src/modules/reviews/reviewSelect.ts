import { userPublicSelect } from "../users/SchemaPublic";

export const reviewPublicSelect = {
  id: true,
  rating: true,
  comment: true,
  productId: true,
  storeId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: userPublicSelect,
  },
} as const;

