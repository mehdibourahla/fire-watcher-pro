import { supabaseAdmin } from "@/integrations/supabase/client.server";

const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function handleDeleteAccount(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "account.deleteFailed" }, 403);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ error: "account.deleteFailed" }, 401);
  try {
    const input: unknown = await request.json();
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).length !== 1 ||
      !("confirmation" in input) ||
      input.confirmation !== "DELETE"
    )
      return json({ error: "account.deleteConfirmation" }, 400);
  } catch {
    return json({ error: "account.deleteConfirmation" }, 400);
  }
  try {
    const { data: auth, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !auth.user)
      return json({ error: "account.deleteFailed" }, 401);
    const id = auth.user.id;
    const admins = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (admins.error) throw new Error("Role lookup failed");
    if (admins.data?.length === 1 && admins.data[0]?.user_id === id)
      return json({ error: "account.deleteLastAdmin" }, 409);
    const bucket = supabaseAdmin.storage.from("report-photos");
    const folders = [id];
    for (let batch = 0; folders.length && batch < 500; batch++) {
      const folder = folders[folders.length - 1];
      const files = await bucket.list(folder, { limit: 100 });
      if (files.error || !files.data) throw new Error("Photo listing failed");
      if (!files.data.length) {
        folders.pop();
        continue;
      }
      const names: string[] = [];
      for (const f of files.data) {
        if (
          !f.name ||
          f.name.includes("/") ||
          f.name.includes("\\") ||
          f.name === "." ||
          f.name === ".."
        )
          throw new Error("Unexpected photo path");
        const path = `${folder}/${f.name}`;
        if (f.id) names.push(path);
        else folders.push(path);
      }
      if (names.length) {
        const removed = await bucket.remove(names);
        if (removed.error) throw new Error("Photo removal failed");
      }
    }
    if (folders.length) throw new Error("Photo cleanup needs another attempt");
    const revoked = await supabaseAdmin.auth.admin.signOut(token, "global");
    if (revoked.error) throw new Error("Session revocation failed");
    const deleted = await supabaseAdmin.auth.admin.deleteUser(id);
    if (deleted.error) throw new Error("Account deletion failed");
    return json({ ok: true }, 200);
  } catch {
    return json({ error: "account.deleteFailed" }, 503);
  }
}
