import {
  afterEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

import "../utils/test-env";
import prisma from "../../src/database/prisma";
import {
  createBlogPost,
  listBlogPosts,
} from "../../src/modules/blog/blog.controller";
import { createMockReq, createMockRes } from "../utils/http";
import { RolesEnum } from "../../src/core/enums";

const originalFindUnique = prisma.blogPost.findUnique;
const originalCreate = prisma.blogPost.create;

afterEach(() => {
  (prisma.blogPost as any).findUnique = originalFindUnique;
  (prisma.blogPost as any).create = originalCreate;
});

describe("blog.controller", () => {
  it("rechaza filtros invalidos en listado", async () => {
    const req = createMockReq({ query: { search: "a" } });
    const res = createMockRes();

    await listBlogPosts(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.success).toBe(false);
  });

  it("impide crear entrada sin privilegios", async () => {
    const req = createMockReq({
      body: {
        title: "Test",
        content: "Contenido del blog de prueba",
      },
    });
    const res = createMockRes();

    await createBlogPost(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("crea entrada para admin", async () => {
    (prisma.blogPost as any).findUnique = mock(async () => null);
    (prisma.blogPost as any).create = mock(async () => ({
      id: "5f9b6c38-64b6-4f9c-9d6c-b8f8948e7f10",
      title: "Test",
      slug: "test",
      excerpt: null,
      content: "Contenido del blog de prueba",
      coverImage: null,
      status: "draft",
      tags: [],
      publishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: "a8b12ad9-33e5-44a0-b41a-7491c1e9a203",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: null,
        displayName: null,
      },
    }));

    const req = createMockReq({
      body: {
        title: "Test",
        content: "Contenido del blog de prueba",
      },
      user: {
        id: "a8b12ad9-33e5-44a0-b41a-7491c1e9a203",
        role: RolesEnum.ADMIN,
      },
    });
    const res = createMockRes();

    await createBlogPost(req as any, res as any);

    expect(prisma.blogPost.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
