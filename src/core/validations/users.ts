import { z } from "zod";
import { RolesEnum } from "../enums";

interface CreateUser {
  email: string;
  password: string;
  role: RolesEnum;
  username: string;
  phone: string;
}

interface Response {
  success: boolean;
  data: Record<string, string>;
}

export const validateCreateUser = ({
  email,
  password,
  role,
  username,
  phone,
}: CreateUser): Response => {
  const objEnum = Object.values(RolesEnum) as [string, ...string[]];

  const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(objEnum),
    username: z.string().min(3),
    phone: z.string().min(10).max(13),
  });

  const result = createUserSchema.safeParse({
    email,
    password,
    role,
    username,
    phone,
  });

  if (!result.success) {
    return {
      success: false,
      data: result.error.issues.reduce(
        (acc: Record<string, string>, issue: z.ZodIssue) => {
          acc[issue.path.join(".")] = issue.message;
          return acc;
        },
        {}
      ),
    };
  }

  return result;
};
