import type { Request, Response } from "express";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import prisma from "../../database/prisma";
import { paginate } from "../../utils/pagination";
import { ApiResponse } from "../../core/responses/ApiResponse";
import { IdSchema } from "../products/validated";
import {
  CreateCategorySchema,
  toSlug,
  UpdateCategorySchema,
} from "./validated";
import { buildWhere } from "../../utils";

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.category,
      where: buildWhere("category", req.query),
      query: req.query,
      orderBy: { createdAt: "desc" },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al obtener categorías", error })
      );
    return;
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const validId = IdSchema.safeParse(id);
    if (!validId.success) {
      res
        .status(400)
        .json(ApiResponse.error({ message: "ID de categoría inválido" }));
      return;
    }

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Categoría no encontrada" }));
      return;
    }

    res.json(ApiResponse.success({ data: existing }));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al obtener categorías", error })
      );
    return;
  }
};

// export const getCategoriesByStore = async (req: Request, res: Response) => {
//   const { storeId } = req.params;

//   const parsed = IdSchema.safeParse(storeId);
//   if (!parsed.success) {
//     res
//       .status(400)
//       .json(ApiResponse.error({ message: "ID de tienda inválido" }));
//     return;
//   }

//   try {
//     const result = await paginate({
//       model: prisma.category,
//       query: req.query,
//       where: { products: { some: { storeId } } },
//       orderBy: { createdAt: "desc" },
//     });

//     res.json(ApiPaginatedResponse.success(result));
//   } catch (error) {
//     res.status(500).json(
//       ApiResponse.error({
//         message: "Error al obtener categorías por tienda",
//         error,
//       })
//     );
//     return;
//   }
// };

export const createCategory = async (req: Request, res: Response) => {
  const parsed = CreateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos inválidos",
        error: parsed.error.format(),
      })
    );
    return;
  }

  const { name, slug, description } = parsed.data as {
    name: string;
    slug?: string;
    description?: string;
  };

  try {
    const finalSlug = slug?.trim() || toSlug(name);

    const created = await prisma.category.create({
      data: { name, slug: finalSlug, ...(description ? { description } : {}) },
    });

    res
      .status(201)
      .json(
        ApiResponse.success({ data: created, message: "Categoría creada" })
      );
  } catch (error: any) {
    if (error?.code === "P2002") {
      res
        .status(409)
        .json(
          ApiResponse.error({ message: "El slug de la categoría ya existe" })
        );
      return;
    }
    res
      .status(500)
      .json(ApiResponse.error({ message: "Error al crear categoría", error }));
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validId = IdSchema.safeParse(id);
  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de categoría inválido" }));
    return;
  }

  const parsed = UpdateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(
      ApiResponse.error({
        message: "Datos inválidos",
        error: parsed.error.format(),
      })
    );
    return;
  }

  const { name, slug, description } = parsed.data as {
    name?: string;
    slug?: string;
    description?: string | null;
  };

  try {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Categoría no encontrada" }));
      return;
    }

    const finalSlug =
      typeof slug === "string" ? slug.trim() : name ? toSlug(name) : undefined;

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(finalSlug !== undefined ? { slug: finalSlug } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });

    res.json(
      ApiResponse.success({ data: updated, message: "Categoría actualizada" })
    );
  } catch (error: any) {
    if (error?.code === "P2002") {
      res
        .status(409)
        .json(
          ApiResponse.error({ message: "El slug de la categoría ya existe" })
        );
      return;
    }
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al actualizar categoría", error })
      );
  }
};

// DELETE /categories/:id
export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;

  const validId = IdSchema.safeParse(id);
  if (!validId.success) {
    res
      .status(400)
      .json(ApiResponse.error({ message: "ID de categoría inválido" }));
    return;
  }

  try {
    // Verificar si la categoría existe
    const category = await prisma.category.findUnique({
      where: { id },
      include: { products: true },
    });

    if (!category) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Categoría no encontrada" }));
      return;
    }

    // Evitar eliminar si tiene productos
    if (category.products.length > 0) {
      res.status(400).json(
        ApiResponse.error({
          message:
            "No se puede eliminar la categoría porque tiene productos asociados",
        })
      );
      return;
    }

    await prisma.category.delete({ where: { id } });

    res.json(
      ApiResponse.success({ message: "Categoría eliminada correctamente" })
    );
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al eliminar categoría", error })
      );
    return;
  }
};
