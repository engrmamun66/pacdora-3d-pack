import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, STATUS_LABEL, isOrderStatus, orderNumber } from "./order-status";
import { BD_DISTRICTS, COUNTRIES, DEFAULT_COUNTRY, isBdDistrict } from "./places";
import { portalCart, portalHome, portalLogin, portalOrders, portalTemplate } from "./portal-paths";

describe("portal addresses", () => {
  it("builds the four public addresses of a Client", () => {
    expect(portalHome("userhash")).toBe("/userhash/templates");
    expect(portalHome("userhash", "linkhash")).toBe("/userhash/linkhash/templates");
    expect(portalTemplate("userhash", null, "tpl")).toBe("/userhash/templates/tpl");
    expect(portalTemplate("userhash", "linkhash", "tpl")).toBe("/userhash/linkhash/templates/tpl");
  });
  it("builds the customer pages, with a safe next address", () => {
    expect(portalCart("u")).toBe("/u/cart");
    expect(portalOrders("u")).toBe("/u/orders");
    expect(portalLogin("u")).toBe("/u/login");
    expect(portalLogin("u", "/u/cart?x=1")).toBe("/u/login?next=%2Fu%2Fcart%3Fx%3D1");
  });
});

describe("order status", () => {
  it("lists the statuses in the order the work goes, each with a label", () => {
    expect(ORDER_STATUSES).toEqual(["new", "confirmed", "in_progress", "done", "cancelled"]);
    for (const s of ORDER_STATUSES) expect(STATUS_LABEL[s].length).toBeGreaterThan(2);
  });
  it("accepts only known statuses", () => {
    expect(isOrderStatus("done")).toBe(true);
    expect(isOrderStatus("shipped")).toBe(false);
    expect(isOrderStatus("")).toBe(false);
  });
  it("shows order numbers from ORD-1001", () => {
    expect(orderNumber(1)).toBe("ORD-1001");
    expect(orderNumber(42)).toBe("ORD-1042");
  });
});

describe("places", () => {
  it("has Bangladesh first and as the default, and all 64 districts", () => {
    expect(COUNTRIES[0]).toBe(DEFAULT_COUNTRY);
    expect(BD_DISTRICTS).toHaveLength(64);
    expect(new Set(BD_DISTRICTS).size).toBe(64);
    expect(isBdDistrict("Dhaka")).toBe(true);
    expect(isBdDistrict("Atlantis")).toBe(false);
  });
});
