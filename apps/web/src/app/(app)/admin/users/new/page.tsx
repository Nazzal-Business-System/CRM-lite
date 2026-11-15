import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  redirect(type === "internal" ? "/admin/users?create=internal" : "/admin/users?create=partner");
}
