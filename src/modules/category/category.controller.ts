import type { Request, Response } from "express";
import type { Category } from "@prisma/client";

import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { buildWhere } from "../../utils";
import { paginate } from "../../utils/pagination";
import { IdSchema } from "../products/validator";
import {
  CreateCategorySchema,
  toSlug,
  UpdateCategorySchema,
} from "./validator";

const ensureParentExists = async (parentId?: string | null) => {
  if (!parentId) return;
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new Error("La categoría padre no existe");
  }
};

type CategoryNode = Category & { children: CategoryNode[] };

const buildCategoryTree = (categories: Category[]): CategoryNode[] => {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  categories.forEach((category) => {
    map.set(category.id, { ...category, children: [] });
  });

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => {
      if (a.order === b.order) {
        return a.name.localeCompare(b.name);
      }
      return a.order - b.order;
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
};

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const result = await paginate({
      model: prisma.category,
      where: buildWhere("category", req.query),
      query: req.query,
      orderBy: [
        { parentId: "asc" },
        { order: "asc" },
        { name: "asc" },
      ],
      include: {
        _count: { select: { products: true } },
      },
    });

    res.json(ApiPaginatedResponse.success(result));
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "Error al obtener categorías", error })
      );
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
        ApiResponse.error({ message: "Error al obtener categoría", error })
      );
  }
};

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

  const { name, slug, description, parentId, order, isFeatured } = parsed.data;

  try {
    const finalSlug = slug?.trim() || toSlug(name);
    await ensureParentExists(parentId ?? undefined);

    const created = await prisma.category.create({
      data: {
        name,
        slug: finalSlug,
        description: description ?? null,
        parentId: parentId ?? null,
        order: order ?? 0,
        isFeatured: isFeatured ?? false,
      },
    });

    res
      .status(201)
      .json(
        ApiResponse.success({ data: created, message: "Categoría creada" })
      );
  } catch (error: any) {
    if (error?.message === "La categoría padre no existe") {
      res.status(400).json(ApiResponse.error({ message: error.message }));
      return;
    }
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

  const { name, slug, description, parentId, order, isFeatured } = parsed.data;

  try {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Categoría no encontrada" }));
      return;
    }

    if (parentId) {
      if (parentId === id) {
        res
          .status(400)
          .json(
            ApiResponse.error({
              message: "La categoría no puede ser su propio padre",
            })
          );
        return;
      }
      await ensureParentExists(parentId);
    }

    const finalSlug =
      typeof slug === "string" ? slug.trim() : name ? toSlug(name) : undefined;

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(finalSlug !== undefined ? { slug: finalSlug } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(isFeatured !== undefined ? { isFeatured } : {}),
      },
    });

    res.json(
      ApiResponse.success({ data: updated, message: "Categoría actualizada" })
    );
  } catch (error: any) {
    if (error?.message === "La categoría padre no existe") {
      res.status(400).json(ApiResponse.error({ message: error.message }));
      return;
    }
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
    const category = await prisma.category.findUnique({
      where: { id },
      include: { products: true, children: true },
    });

    if (!category) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Categoría no encontrada" }));
      return;
    }

    if (category.products.length > 0 || category.children.length > 0) {
      res.status(400).json(
        ApiResponse.error({
          message:
            "No se puede eliminar la categoría porque tiene productos o subcategorías asociadas",
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
  }
};

export const getCategoriesTree = async (req: Request, res: Response) => {
  try {
    const onlyFeatured = req.query.featured === "true";
    const categories = await prisma.category.findMany({
      orderBy: [
        { parentId: "asc" },
        { order: "asc" },
        { name: "asc" },
      ],
    });

    let tree = buildCategoryTree(categories);
    if (onlyFeatured) {
      tree = tree.filter((node) => node.isFeatured);
    }

    res.json(
      ApiResponse.success({
        data: tree,
        message: "Categorías agrupadas",
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(
        ApiResponse.error({ message: "No se pudo cargar el árbol", error })
      );
  }
};
