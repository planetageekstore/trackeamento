import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Abre direto no dashboard do primeiro cliente acessível (RLS).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id").order("name").limit(1).maybeSingle();
  if (data) redirect(`/${data.id}`);

  redirect("/tenants");
}
