import { describe, expect, it } from "bun:test";

import "./test-env";
import {
  generateAccessToken,
  generatePasswordResetToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyPasswordResetToken,
  verifyRefreshToken,
} from "../../src/utils/jwt";

describe("jwt utilities", () => {
  it("generates access tokens that verify", () => {
    const token = generateAccessToken({ id: "user-123" });
    expect(verifyAccessToken(token).sub ?? verifyAccessToken(token).id).toBe(
      "user-123"
    );
  });

  it("generates refresh tokens that verify", () => {
    const token = generateRefreshToken({ id: "user-123" });
    expect(verifyRefreshToken(token).sub ?? verifyRefreshToken(token).id).toBe(
      "user-123"
    );
  });

  it("generates password reset tokens with purpose flag", () => {
    const token = generatePasswordResetToken({ id: "user-123" });
    const payload = verifyPasswordResetToken(token);
    expect(payload.sub ?? payload.id).toBe("user-123");
    expect(payload.purpose).toBe("pwd_reset");
  });

  it("rejects tampered tokens", () => {
    const token = generateAccessToken({ id: "user-123" });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.invalid`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
