import { supabase } from "@/integrations/supabase/client";
import type { EnsemblePreview } from "@/lib/ensemble";

export async function fetchEnsemblePreview(
  code: string,
): Promise<EnsemblePreview> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("signIn");
  const response = await fetch(
    `/api/private/ensemble?commune=${encodeURIComponent(code)}`,
    {
      headers: { authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    const errors: Record<number, string> = {
      401: "signIn",
      403: "forbidden",
      400: "invalidCommune",
      404: "invalidCommune",
      429: "quota",
    };
    throw new Error(errors[response.status] ?? "unavailable");
  }
  return (await response.json()) as EnsemblePreview;
}
