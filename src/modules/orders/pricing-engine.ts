import type { DiscountType, PromotionType, TaxType } from "@prisma/client";

type Precision = number;

export type PriceAdjustmentScope =
  | "product"
  | "store"
  | "global"
  | "shipping"
  | "tax";

export type PriceAdjustment = {
  id?: string;
  code?: string;
  label?: string;
  type: string;
  scope: PriceAdjustmentScope;
  value?: number;
  amount: number;
  metadata?: Record<string, unknown>;
};

export type ProductDiscountRule = {
  id?: string;
  label?: string;
  type: DiscountType | "percentage" | "fixed";
  value: number;
  priority?: number;
  metadata?: Record<string, unknown>;
};

export type TaxRule = {
  id?: string;
  label?: string;
  type: TaxType | "percentage" | "fixed";
  rate: number;
  metadata?: Record<string, unknown>;
};

export type StoreCartDiscountRule = {
  id?: string;
  label?: string;
  type: DiscountType | "percentage" | "fixed";
  value: number;
  minTotal?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
};

export type CouponRule = {
  id?: string;
  code: string;
  type: "fixed" | "percentage" | "shipping";
  value: number;
  scope?: PriceAdjustmentScope;
  minTotal?: number;
  metadata?: Record<string, unknown>;
};

export type PromotionRule = {
  id?: string;
  code?: string | null;
  label?: string;
  type: PromotionType | "automatic" | "coupon";
  value: number;
  discountType?: "percentage" | "fixed";
  scope?: "global" | "store";
  minTotal?: number;
  metadata?: Record<string, unknown>;
};

export type ProductPricingInput = {
  productId: string;
  storeId: string;
  basePrice: number;
  quantity: number;
  discounts?: ProductDiscountRule[];
  taxes?: TaxRule[];
  precision?: Precision;
};

export type ProductPricingResult = {
  productId: string;
  storeId: string;
  quantity: number;
  unitBasePrice: number;
  lineBaseAmount: number;
  unitPriceAfterDiscounts: number;
  unitTaxAmount: number;
  lineNetAmount: number;
  lineTaxAmount: number;
  lineTotal: number;
  discountTotal: number;
  taxTotal: number;
  discountAdjustments: PriceAdjustment[];
  taxAdjustments: PriceAdjustment[];
};

export type StoreCartInput = {
  storeId: string;
  items: ProductPricingResult[];
  discounts?: StoreCartDiscountRule[];
  coupon?: CouponRule | null;
  shippingAmount?: number;
  precision?: Precision;
};

export type StoreCartResult = {
  storeId: string;
  items: ProductPricingResult[];
  subtotalBeforeDiscounts: number;
  subtotalAfterDiscounts: number;
  discountTotal: number;
  shippingAmount: number;
  taxTotal: number;
  adjustments: PriceAdjustment[];
};

export type MarketplaceCartInput = {
  stores: StoreCartInput[];
  promotions?: PromotionRule[];
  precision?: Precision;
};

export type MarketplaceCartResult = {
  stores: StoreCartResult[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  promotionsTotal: number;
  total: number;
  adjustments: PriceAdjustment[];
};

const DEFAULT_PRECISION = 2;

const roundValue = (value: number, precision: Precision = DEFAULT_PRECISION) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const roundCurrency = (value: number, precision?: Precision) =>
  roundValue(value, precision);

const normalizeDiscountType = (type: DiscountType | string) =>
  type === "percentage" || type === "fixed" ? type : (type.toString().toLowerCase() as DiscountType);

const clampPercentage = (value: number) => Math.min(Math.max(value, 0), 100);

export const applyProductDiscounts = (
  product: ProductPricingInput
): {
  unitPrice: number;
  discountTotal: number;
  adjustments: PriceAdjustment[];
} => {
  const precision = product.precision ?? DEFAULT_PRECISION;
  const discounts = [...(product.discounts ?? [])];
  if (discounts.length === 0) {
    return {
      unitPrice: roundValue(product.basePrice, precision),
      discountTotal: 0,
      adjustments: [],
    };
  }

  const percentageDiscounts = discounts
    .filter((rule) => normalizeDiscountType(rule.type) === "percentage")
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  const fixedDiscounts = discounts
    .filter((rule) => normalizeDiscountType(rule.type) === "fixed")
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  const adjustments: PriceAdjustment[] = [];

  let price = product.basePrice;
  let totalDiscount = 0;

  for (const rule of percentageDiscounts) {
    const pct = clampPercentage(rule.value);
    if (pct <= 0) continue;
    const amount = roundValue(price * (pct / 100), precision);
    price = roundValue(price - amount, precision);
    totalDiscount += amount;
    adjustments.push({
      id: rule.id,
      label: rule.label,
      type: "percentage",
      scope: "product",
      value: pct,
      amount,
      metadata: rule.metadata,
    });
  }

  for (const rule of fixedDiscounts) {
    const value = Math.max(rule.value, 0);
    if (value <= 0) continue;
    const amount = roundValue(Math.min(price, value), precision);
    price = roundValue(price - amount, precision);
    totalDiscount += amount;
    adjustments.push({
      id: rule.id,
      label: rule.label,
      type: "fixed",
      scope: "product",
      value,
      amount,
      metadata: rule.metadata,
    });
  }

  if (price < 0) price = 0;

  return {
    unitPrice: roundValue(price, precision),
    discountTotal: roundValue(totalDiscount, precision),
    adjustments,
  };
};

export const calculateProductTax = (
  product: ProductPricingInput & { unitNetPrice?: number }
): {
  unitTax: number;
  taxTotal: number;
  adjustments: PriceAdjustment[];
} => {
  const precision = product.precision ?? DEFAULT_PRECISION;
  const taxes = product.taxes ?? [];
  if (taxes.length === 0) {
    return {
      unitTax: 0,
      taxTotal: 0,
      adjustments: [],
    };
  }

  const base = product.unitNetPrice ?? product.basePrice;
  let unitTaxTotal = 0;
  const adjustments: PriceAdjustment[] = [];

  for (const tax of taxes) {
    const type = normalizeDiscountType(tax.type as DiscountType);
    let amount = 0;
    if (type === "percentage") {
      const pct = clampPercentage(tax.rate);
      amount = roundValue(base * (pct / 100), precision);
      adjustments.push({
        id: tax.id,
        label: tax.label,
        type: "percentage",
        scope: "tax",
        value: pct,
        amount,
        metadata: tax.metadata,
      });
    } else {
      const value = Math.max(tax.rate, 0);
      amount = roundValue(value, precision);
      adjustments.push({
        id: tax.id,
        label: tax.label,
        type: "fixed",
        scope: "tax",
        value,
        amount,
        metadata: tax.metadata,
      });
    }
    unitTaxTotal += amount;
  }

  return {
    unitTax: roundValue(unitTaxTotal, precision),
    taxTotal: roundValue(unitTaxTotal * product.quantity, precision),
    adjustments,
  };
};

export const applyStoreCartDiscounts = (
  cart: StoreCartInput
): StoreCartResult => {
  const precision = cart.precision ?? DEFAULT_PRECISION;
  const subtotalBeforeDiscounts = roundValue(
    cart.items.reduce((sum, item) => sum + item.lineNetAmount, 0),
    precision
  );

  let subtotalAfterDiscounts = subtotalBeforeDiscounts;
  let discountTotal = 0;
  const adjustments: PriceAdjustment[] = [];

  const discounts = [...(cart.discounts ?? [])];
  const percentageRules = discounts
    .filter((rule) => normalizeDiscountType(rule.type) === "percentage")
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const fixedRules = discounts
    .filter((rule) => normalizeDiscountType(rule.type) === "fixed")
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  const applyDiscountRule = (rule: StoreCartDiscountRule) => {
    const meetsMinTotal =
      rule.minTotal === undefined ||
      subtotalBeforeDiscounts >= (rule.minTotal ?? 0);

    if (!meetsMinTotal) return;

    if (normalizeDiscountType(rule.type) === "percentage") {
      const pct = clampPercentage(rule.value);
      if (pct <= 0) return;
      const amount = roundValue(subtotalAfterDiscounts * (pct / 100), precision);
      subtotalAfterDiscounts = roundValue(subtotalAfterDiscounts - amount, precision);
      discountTotal += amount;
      adjustments.push({
        id: rule.id,
        label: rule.label,
        type: "percentage",
        scope: "store",
        value: pct,
        amount,
        metadata: rule.metadata,
      });
    } else {
      const value = Math.max(rule.value, 0);
      if (value <= 0) return;
      const amount = roundValue(Math.min(subtotalAfterDiscounts, value), precision);
      subtotalAfterDiscounts = roundValue(subtotalAfterDiscounts - amount, precision);
      discountTotal += amount;
      adjustments.push({
        id: rule.id,
        label: rule.label,
        type: "fixed",
        scope: "store",
        value,
        amount,
        metadata: rule.metadata,
      });
    }
  };

  for (const rule of percentageRules) applyDiscountRule(rule);
  for (const rule of fixedRules) applyDiscountRule(rule);

  let shippingAmount = roundValue(cart.shippingAmount ?? 0, precision);

  if (cart.coupon) {
    const meetsMinTotal =
      cart.coupon.minTotal === undefined ||
      subtotalBeforeDiscounts >= (cart.coupon.minTotal ?? 0);

    if (meetsMinTotal) {
      if (cart.coupon.type === "shipping") {
        const amount = shippingAmount;
        shippingAmount = 0;
        if (amount > 0) {
          adjustments.push({
            id: cart.coupon.id,
            code: cart.coupon.code,
            type: "shipping",
            scope: "shipping",
            amount: roundValue(amount, precision),
            metadata: cart.coupon.metadata,
          });
          discountTotal += amount;
        }
      } else if (cart.coupon.type === "percentage") {
        const pct = clampPercentage(cart.coupon.value);
        if (pct > 0) {
          const amount = roundValue(subtotalAfterDiscounts * (pct / 100), precision);
          subtotalAfterDiscounts = roundValue(subtotalAfterDiscounts - amount, precision);
          discountTotal += amount;
          adjustments.push({
            id: cart.coupon.id,
            code: cart.coupon.code,
            type: "percentage",
            scope: cart.coupon.scope ?? "store",
            value: pct,
            amount,
            metadata: cart.coupon.metadata,
          });
        }
      } else if (cart.coupon.type === "fixed") {
        const value = Math.max(cart.coupon.value, 0);
        if (value > 0) {
          const amount = roundValue(
            Math.min(subtotalAfterDiscounts, value),
            precision
          );
          subtotalAfterDiscounts = roundValue(subtotalAfterDiscounts - amount, precision);
          discountTotal += amount;
          adjustments.push({
            id: cart.coupon.id,
            code: cart.coupon.code,
            type: "fixed",
            scope: cart.coupon.scope ?? "store",
            value,
            amount,
            metadata: cart.coupon.metadata,
          });
        }
      }
    }
  }

  if (subtotalAfterDiscounts < 0) subtotalAfterDiscounts = 0;

  const taxTotal = roundValue(
    cart.items.reduce((sum, item) => sum + item.lineTaxAmount, 0),
    precision
  );

  return {
    storeId: cart.storeId,
    items: cart.items,
    subtotalBeforeDiscounts,
    subtotalAfterDiscounts: roundValue(subtotalAfterDiscounts, precision),
    discountTotal: roundValue(discountTotal, precision),
    shippingAmount,
    taxTotal,
    adjustments,
  };
};

export const applyGlobalPromotions = (
  cart: MarketplaceCartInput,
  storeResults: StoreCartResult[]
): {
  promotionsTotal: number;
  adjustments: PriceAdjustment[];
} => {
  const precision = cart.precision ?? DEFAULT_PRECISION;
  const promotions = cart.promotions ?? [];

  if (promotions.length === 0) {
    return { promotionsTotal: 0, adjustments: [] };
  }

  const totalBeforePromotions = roundValue(
    storeResults.reduce(
      (sum, store) => sum + store.subtotalAfterDiscounts + store.shippingAmount,
      0
    ),
    precision
  );

  let remainingBase = totalBeforePromotions;
  let promotionsTotal = 0;
  const adjustments: PriceAdjustment[] = [];

  const applicablePromotions = promotions.filter((promo) => {
    if (promo.minTotal !== undefined && promo.minTotal > totalBeforePromotions) {
      return false;
    }
    return promo.value > 0;
  });

  for (const promotion of applicablePromotions) {
    const discountType = promotion.discountType ?? "percentage";
    let amount = 0;

    if (discountType === "percentage") {
      const pct = clampPercentage(promotion.value);
      amount = roundValue(remainingBase * (pct / 100), precision);
    } else {
      amount = roundValue(Math.min(remainingBase, Math.max(promotion.value, 0)), precision);
    }

    if (amount <= 0) continue;

    remainingBase = roundValue(remainingBase - amount, precision);
    promotionsTotal += amount;
    adjustments.push({
      id: promotion.id,
      code: promotion.code ?? undefined,
      label: promotion.label,
      type: promotion.discountType ?? "percentage",
      scope: "global",
      value: promotion.value,
      amount,
      metadata: promotion.metadata,
    });
  }

  return {
    promotionsTotal: roundValue(promotionsTotal, precision),
    adjustments,
  };
};

export const calculateCartTotals = (cart: MarketplaceCartInput): MarketplaceCartResult => {
  const precision = cart.precision ?? DEFAULT_PRECISION;

  const storeResults = cart.stores.map((storeCart) =>
    applyStoreCartDiscounts({
      ...storeCart,
      items: storeCart.items.map((item) => ({ ...item })),
    })
  );

  const { promotionsTotal, adjustments: promotionAdjustments } = applyGlobalPromotions(
    cart,
    storeResults
  );

  const subtotal = roundValue(
    storeResults.reduce(
      (sum, store) => sum + store.subtotalBeforeDiscounts,
      0
    ),
    precision
  );

  const productDiscountTotal = roundValue(
    storeResults.reduce(
      (sum, store) =>
        sum +
        store.items.reduce((itemSum, item) => itemSum + item.discountTotal, 0),
      0
    ),
    precision
  );

  const storeDiscountTotal = roundValue(
    storeResults.reduce((sum, store) => sum + store.discountTotal, 0),
    precision
  );

  const taxTotal = roundValue(
    storeResults.reduce(
      (sum, store) => sum + store.items.reduce((acc, item) => acc + item.lineTaxAmount, 0),
      0
    ),
    precision
  );

  const shippingTotal = roundValue(
    storeResults.reduce((sum, store) => sum + store.shippingAmount, 0),
    precision
  );

  const totalBeforePromotions = roundValue(
    storeResults.reduce(
      (sum, store) =>
        sum +
        store.subtotalAfterDiscounts +
        store.items.reduce((acc, item) => acc + item.lineTaxAmount, 0) +
        store.shippingAmount,
      0
    ),
    precision
  );

  const total = roundValue(totalBeforePromotions - promotionsTotal, precision);

  const adjustments: PriceAdjustment[] = [
    ...storeResults.flatMap((store) => [
      ...store.items.flatMap((item) => [
        ...item.discountAdjustments,
        ...item.taxAdjustments,
      ]),
      ...store.adjustments,
    ]),
    ...promotionAdjustments,
  ];

  return {
    stores: storeResults,
    subtotal,
    discountTotal: roundValue(
      productDiscountTotal + storeDiscountTotal + promotionsTotal,
      precision
    ),
    taxTotal,
    shippingTotal,
    promotionsTotal,
    total,
    adjustments,
  };
};
