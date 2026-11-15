import { z } from "zod";
export const demoIdSchema = z.enum(["erp", "pos", "ims"]);
const destination = z.url().refine(value => {
  const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash;
}, "Destinations must use HTTPS without credentials.");
export const demoResponseSchema = z.object({
  demos: z.array(z.object({ id: demoIdSchema, url: destination })).max(3).refine(items => new Set(items.map(item => item.id)).size === items.length, "Demo systems must be unique."),
  resources: z.array(z.object({ id: z.literal("website"), url: destination })).max(1),
});
export type Demo = z.infer<typeof demoResponseSchema>["demos"][number];
export type DemoResource = z.infer<typeof demoResponseSchema>["resources"][number];
