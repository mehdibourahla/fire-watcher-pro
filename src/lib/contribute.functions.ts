import { createServerFn } from "@tanstack/react-start";

/** Server-side so the counts run under the service role and render with the page,
 * rather than arriving after a second round trip on a page that is mostly text. */
export const getDeficits = createServerFn({ method: "GET" }).handler(
  async () => {
    const { readDeficits } = await import("@/lib/contribute.server");
    return readDeficits();
  },
);
