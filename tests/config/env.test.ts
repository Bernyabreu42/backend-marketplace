import { describe, expect, it } from "bun:test";

import "../utils/test-env";
import { env, parseOrigins } from "../../src/config/env";

describe("parseOrigins", () => {
  it("parses JSON arrays", () => {
    const input = '["https://a.com", "https://b.com"]';
    expect(parseOrigins(input)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("parses single JSON string", () => {
    const input = '"https://solo.com"';
    expect(parseOrigins(input)).toEqual(["https://solo.com"]);
  });

  it("parses comma separated list", () => {
    const input = "https://a.com, https://b.com ,";
    expect(parseOrigins(input)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("returns empty array for falsy values", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("   ")).toEqual([]);
  });
});

describe("env", () => {
  it("exposes validated defaults", () => {
    expect(env.API_USERNAME.length).toBeGreaterThan(0);
    expect(env.API_PASSWORD.length).toBeGreaterThan(0);
    expect(env.CLIENT_ORIGINS.length).toBeGreaterThan(0);
    expect(env.CLIENT_URL.length).toBeGreaterThan(0);
  });
});
