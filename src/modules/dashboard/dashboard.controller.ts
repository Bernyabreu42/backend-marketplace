import type { Request, Response } from "express";

import { ApiResponse } from "../../core/responses/ApiResponse";
import {
  buildRange,
  getLoyaltySummary,
  getOrdersByStatus,
  getSalesOverview,
  getSalesTimeseries,
  getTopProducts,
} from "./dashboard.service";
import { OverviewQuerySchema, RangeQuerySchema, TopProductsQuerySchema } from "./validator";

const handleValidation = <T>(result: ReturnType<typeof OverviewQuerySchema.safeParse | typeof RangeQuerySchema.safeParse>): ApiResponse | null => {
  const parsed = result as any;
  if (parsed.success) return null;
  const issue = parsed.error?.issues?.[0];
  return ApiResponse.error({
    message: issue?.message ?? "Datos invalidos",
    error: parsed.error.flatten(),
  });
};

export const getOverview = async (req: Request, res: Response) => {
  const parsed = OverviewQuerySchema.safeParse(req.query);
  const error = handleValidation(parsed);
  if (error) {
    res.status(400).json(error);
    return;
  }

  try {
    const range = buildRange(parsed.data.rangeStart, parsed.data.rangeEnd, parsed.data.days ?? 30);
    const data = await getSalesOverview(range);
    res.json(
      ApiResponse.success({
        data: { range, ...data },
        message: "Resumen obtenido",
      })
    );
  } catch (err) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "No se pudo obtener el resumen", error: err }));
  }
};

export const getSalesSeries = async (req: Request, res: Response) => {
  const parsed = RangeQuerySchema.safeParse(req.query);
  const error = handleValidation(parsed);
  if (error) {
    res.status(400).json(error);
    return;
  }

  try {
    const range = buildRange(parsed.data.rangeStart, parsed.data.rangeEnd, parsed.data.days ?? 30);
    const data = await getSalesTimeseries(range);
    res.json(
      ApiResponse.success({
        data: { range, points: data },
        message: "Serie obtenida",
      })
    );
  } catch (err) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "No se pudo obtener la serie", error: err }));
  }
};

export const getOrdersStatus = async (req: Request, res: Response) => {
  const parsed = RangeQuerySchema.safeParse(req.query);
  const error = handleValidation(parsed);
  if (error) {
    res.status(400).json(error);
    return;
  }

  try {
    const range = buildRange(parsed.data.rangeStart, parsed.data.rangeEnd, parsed.data.days ?? 30);
    const data = await getOrdersByStatus(range);
    res.json(
      ApiResponse.success({
        data: { range, statuses: data },
        message: "Estados obtenidos",
      })
    );
  } catch (err) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "No se pudo obtener los estados", error: err }));
  }
};

export const getLoyaltyStats = async (req: Request, res: Response) => {
  const parsed = RangeQuerySchema.safeParse(req.query);
  const error = handleValidation(parsed);
  if (error) {
    res.status(400).json(error);
    return;
  }

  try {
    const range = buildRange(parsed.data.rangeStart, parsed.data.rangeEnd, parsed.data.days ?? 30);
    const data = await getLoyaltySummary(range);
    res.json(
      ApiResponse.success({
        data: { range, ...data },
        message: "Estadisticas de lealtad",
      })
    );
  } catch (err) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "No se pudo obtener estadisticas", error: err }));
  }
};

export const getTopProductsHandler = async (req: Request, res: Response) => {
  const parsed = TopProductsQuerySchema.safeParse(req.query);
  const error = handleValidation(parsed);
  if (error) {
    res.status(400).json(error);
    return;
  }

  try {
    const range = buildRange(parsed.data.rangeStart, parsed.data.rangeEnd, parsed.data.days ?? 30);
    const data = await getTopProducts(range, parsed.data.limit ?? 5);
    res.json(
      ApiResponse.success({
        data: { range, products: data },
        message: "Productos destacados",
      })
    );
  } catch (err) {
    res
      .status(500)
      .json(ApiResponse.error({ message: "No se pudieron obtener los productos", error: err }));
  }
};
