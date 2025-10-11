import { z } from "zod";

import { BlogPostStatusEnum } from "../../core/enums";

const blogStatusValues = [
  BlogPostStatusEnum.DRAFT,
  BlogPostStatusEnum.PUBLISHED,
  BlogPostStatusEnum.ARCHIVED,
] as const;

export const BlogQuerySchema = z.object({
  status: z.enum(blogStatusValues).optional(),
  tag: z.string().min(1).max(50).optional(),
  search: z.string().min(2).max(120).optional(),
});

export const CreateBlogPostSchema = z.object({
  title: z.string().trim().min(3).max(180),
  excerpt: z.string().trim().max(320).optional(),
  content: z.string().trim().min(20),
  coverImage: z.string().url().optional(),
  status: z.enum(blogStatusValues).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  publishedAt: z.string().datetime().optional(),
});

export const UpdateBlogPostSchema = CreateBlogPostSchema.partial();

export const BlogIdSchema = z.object({
  id: z.string().uuid(),
});

export const BlogSlugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
});
