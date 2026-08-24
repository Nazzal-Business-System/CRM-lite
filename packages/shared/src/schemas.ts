import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.");

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.email("Enter a valid email address."),
  password: passwordSchema,
  roleId: z.string().min(1, "Role is required."),
  isActive: z.boolean().optional().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120).optional(),
    email: z.email("Enter a valid email address.").optional(),
    password: passwordSchema.optional(),
    roleId: z.string().min(1, "Role is required.").optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "At least one field is required." },
  );

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateUserActivationSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateUserActivationInput = z.infer<typeof updateUserActivationSchema>;

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  description: z.string().trim().max(280).optional().default(""),
  permissionKeys: z.array(z.string()).default([]),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80).optional(),
  description: z.string().trim().max(280).optional(),
  permissionKeys: z.array(z.string()).optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
