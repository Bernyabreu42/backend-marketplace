import type { Request, Response } from "express";
import { BlogPostStatus } from "@prisma/client";

import { RolesEnum } from "../../core/enums";
import { ApiPaginatedResponse } from "../../core/responses/ApiPaginatedResponse";
import { ApiResponse } from "../../core/responses/ApiResponse";
import prisma from "../../database/prisma";
import { andWhere } from "../../utils";
import { paginate } from "../../utils/pagination";
import {
  BlogIdSchema,
  BlogQuerySchema,
  BlogSlugSchema,
  CreateBlogPostSchema,
  UpdateBlogPostSchema,
} from "./validator";

const BLOG_INCLUDE = {
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      email: true,
    },
  },
} as const;

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const isElevated = (role?: RolesEnum | null) =>
  role === RolesEnum.ADMIN || role === RolesEnum.SUPPORT;

const mapValidationError = (result: any) => {
  if (result.success) return null;
  const issue = result.error?.issues?.[0];
  const message = issue?.message ?? "Datos invalidos";
  return ApiResponse.error({ message, error: result.error.flatten() });
};

const ensureUniqueSlug = async (slug: string, ignoreId?: string) => {
  let finalSlug = slug;
  let suffix = 1;

  while (true) {
    const existing = await prisma.blogPost.findUnique({
      where: { slug: finalSlug },
      select: { id: true },
    });

    if (!existing || existing.id === ignoreId) break;
    finalSlug = `${slug}-${suffix}`;
    suffix += 1;
  }

  return finalSlug;
};

export const listBlogPosts = async (req: Request, res: Response) => {
  const parsed = BlogQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const errorResponse = mapValidationError(parsed);
    res.status(400).json(errorResponse);
    return;
  }

  const filters = parsed.data ?? {};
  const requesterRole = req.user?.role as RolesEnum | undefined;
  const elevated = isElevated(requesterRole);

  const where = andWhere(
    { isDeleted: false },
    elevated ? undefined : { status: BlogPostStatus.published },
    elevated ? undefined : { publishedAt: { lte: new Date() } },
    filters.status && elevated ? { status: filters.status as BlogPostStatus } : undefined,
    filters.tag ? { tags: { has: filters.tag } } : undefined,
    filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { excerpt: { contains: filters.search, mode: "insensitive" } },
            { content: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : undefined
  );

  try {
    const result = await paginate({
      model: prisma.blogPost,
      query: req.query,
      where,
      include: BLOG_INCLUDE,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });

    res.json(
      ApiPaginatedResponse.success({
        data: result.data,
        pagination: result.pagination,
        message: "Entradas del blog",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudieron obtener las entradas del blog",
        error,
      })
    );
  }
};

export const getBlogPostBySlug = async (req: Request, res: Response) => {
  const parsed = BlogSlugSchema.safeParse(req.params);
  if (!parsed.success) {
    const errorResponse = mapValidationError(parsed);
    res.status(400).json(errorResponse);
    return;
  }

  const requesterRole = req.user?.role as RolesEnum | undefined;
  const elevated = isElevated(requesterRole);

  try {
    const post = await prisma.blogPost.findFirst({
      where: andWhere(
        { slug: parsed.data.slug },
        { isDeleted: false },
        elevated ? undefined : { status: BlogPostStatus.published },
        elevated ? undefined : { publishedAt: { lte: new Date() } }
      ),
      include: BLOG_INCLUDE,
    });

    if (!post) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Entrada no encontrada" }));
      return;
    }

    res.json(ApiResponse.success({ data: post, message: "Entrada obtenida" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo obtener la entrada",
        error,
      })
    );
  }
};

export const createBlogPost = async (req: Request, res: Response) => {
  if (!isElevated(req.user?.role as RolesEnum | undefined)) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  const parsed = CreateBlogPostSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorResponse = mapValidationError(parsed);
    res.status(400).json(errorResponse);
    return;
  }

  try {
    const payload = parsed.data;
    const baseSlug = slugify(payload.title);
    const slug = await ensureUniqueSlug(baseSlug);
    const tags = Array.from(new Set(payload.tags ?? []))
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const status = (payload.status ?? BlogPostStatus.draft) as BlogPostStatus;
    const publishedAt =
      status === BlogPostStatus.published
        ? payload.publishedAt
          ? new Date(payload.publishedAt)
          : new Date()
        : payload.publishedAt
        ? new Date(payload.publishedAt)
        : null;

    const post = await prisma.blogPost.create({
      data: {
        title: payload.title,
        slug,
        excerpt: payload.excerpt ?? null,
        content: payload.content,
        coverImage: payload.coverImage ?? null,
        status,
        tags,
        publishedAt,
        authorId: req.user!.id,
      },
      include: BLOG_INCLUDE,
    });

    res.status(201).json(
      ApiResponse.success({
        data: post,
        message: "Entrada creada",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo crear la entrada",
        error,
      })
    );
  }
};

export const updateBlogPost = async (req: Request, res: Response) => {
  if (!isElevated(req.user?.role as RolesEnum | undefined)) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  const params = BlogIdSchema.safeParse(req.params);
  const body = UpdateBlogPostSchema.safeParse(req.body);

  const paramsError = mapValidationError(params);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  const bodyError = mapValidationError(body);
  if (bodyError) {
    res.status(400).json(bodyError);
    return;
  }

  try {
    const existing = await prisma.blogPost.findFirst({
      where: { id: params.data.id, isDeleted: false },
    });

    if (!existing) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Entrada no encontrada" }));
      return;
    }

    const payload = body.data;
    const updates: any = {};

    if (payload.title) {
      updates.title = payload.title;
      const newSlug = await ensureUniqueSlug(slugify(payload.title), existing.id);
      updates.slug = newSlug;
    }

    if (payload.excerpt !== undefined) updates.excerpt = payload.excerpt ?? null;
    if (payload.content) updates.content = payload.content;
    if (payload.coverImage !== undefined)
      updates.coverImage = payload.coverImage ?? null;

    if (payload.tags) {
      updates.tags = Array.from(new Set(payload.tags.map((tag) => tag.trim())))
        .filter((tag) => tag.length > 0);
    }

    if (payload.status) {
      updates.status = payload.status as BlogPostStatus;
    }

    if (payload.publishedAt) {
      updates.publishedAt = new Date(payload.publishedAt);
    }

    if (updates.status === BlogPostStatus.published && !updates.publishedAt) {
      updates.publishedAt = new Date();
    }

    if (
      updates.status &&
      updates.status !== BlogPostStatus.published &&
      payload.publishedAt === undefined
    ) {
      updates.publishedAt = null;
    }

    const post = await prisma.blogPost.update({
      where: { id: existing.id },
      data: updates,
      include: BLOG_INCLUDE,
    });

    res.json(
      ApiResponse.success({
        data: post,
        message: "Entrada actualizada",
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo actualizar la entrada",
        error,
      })
    );
  }
};

export const deleteBlogPost = async (req: Request, res: Response) => {
  if (!isElevated(req.user?.role as RolesEnum | undefined)) {
    res.status(403).json(ApiResponse.error({ message: "Acceso denegado" }));
    return;
  }

  const parsed = BlogIdSchema.safeParse(req.params);
  const paramsError = mapValidationError(parsed);
  if (paramsError) {
    res.status(400).json(paramsError);
    return;
  }

  try {
    const existing = await prisma.blogPost.findFirst({
      where: { id: parsed.data.id, isDeleted: false },
    });

    if (!existing) {
      res
        .status(404)
        .json(ApiResponse.error({ message: "Entrada no encontrada" }));
      return;
    }

    await prisma.blogPost.update({
      where: { id: parsed.data.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user?.id ?? null,
      },
    });

    res.json(ApiResponse.success({ message: "Entrada eliminada" }));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error({
        message: "No se pudo eliminar la entrada",
        error,
      })
    );
  }
};
