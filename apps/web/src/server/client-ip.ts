import "server-only";
import { env } from "./env";

/** The caller's address from the header the reverse proxy sets (CLIENT_IP_HEADER), or null. */
export function clientIp(request: Request): string | null {
  const v = request.headers.get(env.CLIENT_IP_HEADER);
  const first = v?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : null;
}
