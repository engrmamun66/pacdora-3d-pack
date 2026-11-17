/** Public addresses of a Client's portal (see server/portal.ts). `scopeHash` is a category or tag link hash, or null for all templates. */
export const portalHome = (userHash: string, scopeHash: string | null = null) => (scopeHash ? `/${userHash}/${scopeHash}/templates` : `/${userHash}/templates`);
export const portalTemplate = (userHash: string, scopeHash: string | null, templateHash: string) => `${portalHome(userHash, scopeHash).replace(/\/templates$/, "")}/templates/${templateHash}`;
export const portalCart = (userHash: string) => `/${userHash}/cart`;
export const portalOrders = (userHash: string) => `/${userHash}/orders`;
export const portalLogin = (userHash: string, next?: string) => `/${userHash}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
export const portalOrder = (userHash: string, orderNumber: number) => `/${userHash}/orders/${1000 + orderNumber}`;
