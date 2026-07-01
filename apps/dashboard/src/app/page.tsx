import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Após login, o roteamento por escopo (agência vs cliente) é resolvido nas
  // áreas (agency)/(tenant). Placeholder da fundação:
  redirect("/tenants");
}
