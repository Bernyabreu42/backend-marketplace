import type { TaxType } from "@prisma/client";
import prisma from "../../../database/prisma";

export type DiscountSummary = {
  id: string;
  type: string;
  value: number;
};

export const findApplicableDiscount = async (
  discountId: string,
  storeId: string
): Promise<DiscountSummary | null> => {
  if (!discountId) return null;

  const discount = await prisma.discount.findFirst({
    where: {
      id: discountId,
      storeId,
      isDeleted: false,
      status: { not: "deleted" },
    },
    select: {
      id: true,
      type: true,
      value: true,
    },
  });

  return discount ?? null;
};

export const computePriceWithDiscount = (
  basePrice: number,
  discount: DiscountSummary | null
) => {
  if (!discount) return basePrice;

  let price = basePrice;
  if (discount.type === "percentage") {
    price = basePrice - (basePrice * discount.value) / 100;
  } else if (discount.type === "fixed") {
    price = basePrice - discount.value;
  }

  return Math.max(price, 0);
};

export type TaxSummary = {
  id: string;
  type: TaxType;
  rate: number;
};

export const findStoreTaxesByIds = async (
  storeId: string,
  taxIds: string[]
): Promise<TaxSummary[]> => {
  const uniqueIds = Array.from(
    new Set(taxIds.filter((id): id is string => typeof id === "string"))
  );

  if (uniqueIds.length === 0) {
    return [];
  }

  const taxes = await prisma.tax.findMany({
    where: {
      id: { in: uniqueIds },
      storeId,
      isDeleted: false,
      status: { not: "deleted" },
    },
    select: {
      id: true,
      type: true,
      rate: true,
    },
  });

  return taxes;
};

export const applyTaxesToPrice = (
  basePrice: number,
  taxes: TaxSummary[]
) => {
  return taxes.reduce((price, tax) => {
    if (tax.type === "percentage") {
      return price + (price * tax.rate) / 100;
    }
    return price + tax.rate;
  }, basePrice);
};
