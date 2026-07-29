import test from "node:test";
import assert from "node:assert/strict";
import {
  calcDeliveryCost,
  getWhatsAppNumber,
  normalizeOrderStatus,
  normalizePhone,
  productUnitPrice,
} from "../src/utils/format.js";
import { validateSeedData } from "../src/seed/validateSeed.js";

test("normaliza teléfonos argentinos para WhatsApp", () => {
  assert.equal(normalizePhone("+54 9 376 513-0819"), "5493765130819");
  assert.equal(
    getWhatsAppNumber({
      contact: { whatsappPrimary: "3765130819", whatsappCountryCode: "54" },
    }),
    "5493765130819"
  );
});

test("normaliza estados y precios de productos", () => {
  assert.equal(normalizeOrderStatus("nuevo"), "pendiente");
  assert.equal(productUnitPrice({ price: 9000 }), 9000);
  assert.equal(
    productUnitPrice({ price: 9000, isOnSale: true, salePrice: 7500 }),
    7500
  );
});

test("calcula envío por zonas ordenadas", () => {
  const shipping = {
    zoneCosts: [
      { maxKm: 8, cost: 4500 },
      { maxKm: 3, cost: 2000 },
    ],
  };
  assert.equal(calcDeliveryCost(2.5, { shipping }), 2000);
  assert.equal(calcDeliveryCost(6, { shipping }), 4500);
});

test("los datos demo mantienen integridad", () => {
  const validation = validateSeedData();
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.ok(validation.counts.reservations >= 3);
});
