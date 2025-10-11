import type { Request, Response } from "express";
import { mock } from "bun:test";

type PartialRequest = Partial<Request> & Record<string, any>;

type MockResponse = Response & {
  statusCode: number;
  body: any;
  cookies: Array<{ name: string; value: unknown; options?: any }>;
};

export const createMockReq = (overrides: PartialRequest = {}): PartialRequest => {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    cookies: {},
    ...overrides,
  } as PartialRequest;
};

export const createMockRes = (): MockResponse => {
  const res: any = {
    statusCode: 200,
    body: undefined,
    cookies: [] as Array<{ name: string; value: unknown; options?: any }>,
  };

  res.status = mock((code: number) => {
    res.statusCode = code;
    return res;
  });

  res.json = mock((payload: unknown) => {
    res.body = payload;
    return res;
  });

  res.cookie = mock((name: string, value: unknown, options?: any) => {
    res.cookies.push({ name, value, options });
    return res;
  });

  res.clearCookie = mock(() => res);

  return res as MockResponse;
};

