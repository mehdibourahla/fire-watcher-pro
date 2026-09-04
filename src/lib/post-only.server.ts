export function postOnlyMethodNotAllowed() {
  return new Response(JSON.stringify({ error: "method not allowed" }), {
    status: 405,
    headers: {
      Allow: "POST",
      "Content-Type": "application/json",
    },
  });
}
