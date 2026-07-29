import { assertValidSeedData } from "./validateSeed.js";

try {
  const result = assertValidSeedData();
  console.log(
    `Demo válida: ${result.counts.products} productos, ${result.counts.promotions} promociones, ` +
      `${result.counts.coupons} cupones, ${result.counts.customers} clientes y ${result.counts.orders} pedidos.`
  );
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
