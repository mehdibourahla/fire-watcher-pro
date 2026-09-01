export function postOnlyMethodNotAllowed(allow = "POST") {
  return new Response(JSON.stringify({ error: "method not allowed" }), {
    status: 405,
    headers: {
      Allow: allow,
      "Content-Type": "application/json",
    },
  });
}
