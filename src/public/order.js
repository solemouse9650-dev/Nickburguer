import { createOrderFromCheckout } from "../services/orders.js";
import { getCouponByCode, validateCoupon } from "../services/coupons.js";
import { DEFAULT_SETTINGS } from "../services/settings.js";
import {
  calcDeliveryCost,
  escapeHtml,
  formatMoney,
  getWhatsAppNumber,
  haversineKm,
  normalizePhone,
} from "../utils/format.js";
import { showToast } from "../utils/toast.js";
import { Cart } from "./cart.js";
import { getProductById, store } from "./store.js";

export const OrderFlow = (() => {
  const state = {
    step: 1,
    customer: { firstName: "", lastName: "", whatsapp: "", email: "", notes: "" },
    payment: "Mercado Pago",
    deliveryMethod: "pickup",
    clientLat: null,
    clientLng: null,
    address: "",
    distanceKm: 0,
    deliveryCost: 0,
    coupon: null,
    couponCode: "",
    discount: 0,
    orderNumber: null,
    orderMap: null,
    storeMarker: null,
    clientMarker: null,
    routeLine: null,
    saving: false,
    lastOrderItems: [],
    lastOrderTotals: null,
  };

  const els = {};
  let lastCartFocus = null;

  function settings() {
    return store.settings || DEFAULT_SETTINGS;
  }

  function cacheEls() {
    els.modal = document.getElementById("orderModal");
    els.title = document.getElementById("orderModalTitle");
    els.preview = document.getElementById("orderProductPreview");
    els.steps = document.querySelectorAll("[data-step-indicator]");
    els.stepPanels = document.querySelectorAll(".order-step[data-step]");
    els.btnPrev = document.getElementById("btnPrev");
    els.btnNext = document.getElementById("btnNext");
    els.modalFoot = document.getElementById("modalFoot");
    els.deliveryPanel = document.getElementById("deliveryPanel");
    els.deliveryMeta = document.getElementById("deliveryMeta");
    els.summary = document.getElementById("orderSummary");
    els.confirm = document.getElementById("orderConfirm");
    els.orderMap = document.getElementById("orderMap");
    els.cartDrawer = document.getElementById("cartDrawer");
    els.cartBackdrop = document.getElementById("cartBackdrop");
    els.cartItems = document.getElementById("cartItems");
    els.cartSubtotal = document.getElementById("cartSubtotal");
    els.cartCount = document.getElementById("cartCount");
  }

  function cartLines() {
    return Cart.getItems();
  }

  function getSubtotal() {
    return Cart.subtotal();
  }

  function openCart() {
    cacheEls();
    lastCartFocus = document.activeElement;
    renderCartDrawer();
    els.cartDrawer?.classList.add("is-open");
    els.cartBackdrop?.classList.add("is-open");
    els.cartDrawer?.setAttribute("aria-hidden", "false");
    els.cartBackdrop?.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");
    requestAnimationFrame(() => {
      els.cartDrawer?.querySelector("[data-close-cart]")?.focus();
    });
  }

  function closeCart() {
    els.cartDrawer?.classList.remove("is-open");
    els.cartBackdrop?.classList.remove("is-open");
    els.cartDrawer?.setAttribute("aria-hidden", "true");
    els.cartBackdrop?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");
    if (lastCartFocus instanceof HTMLElement) lastCartFocus.focus();
    lastCartFocus = null;
  }

  function isCartOpen() {
    return els.cartDrawer?.classList.contains("is-open");
  }

  function renderCartBadge() {
    const n = Cart.count();
    const el = els.cartCount || document.getElementById("cartCount");
    if (!el) return;
    el.textContent = String(n);
    el.hidden = n <= 0;
    el.classList.toggle("is-bump", n > 0);
  }

  function renderCartDrawer() {
    cacheEls();
    renderCartBadge();
    if (!els.cartItems) return;
    const items = cartLines();
    const count = Cart.count();
    const meta = document.getElementById("cartMeta");
    const clearBtn = document.getElementById("cartClearBtn");
    const checkoutBtn = document.getElementById("cartCheckoutBtn");
    const hint = document.getElementById("cartHint");

    if (meta) {
      meta.textContent =
        count === 0 ? "Sin productos" : count === 1 ? "1 producto" : `${count} productos`;
    }
    if (clearBtn) clearBtn.hidden = items.length === 0;
    if (els.cartSubtotal) els.cartSubtotal.textContent = formatMoney(getSubtotal());
    if (checkoutBtn) {
      checkoutBtn.disabled = items.length === 0;
      checkoutBtn.textContent = items.length ? "Ir a pagar" : "Carrito vacío";
    }
    if (hint) {
      const minOrder = Number(settings().shipping?.minOrderAmount || 0);
      if (items.length && minOrder > 0 && getSubtotal() < minOrder) {
        hint.textContent = `Pedido mínimo: ${formatMoney(minOrder)}`;
        hint.classList.add("is-warn");
      } else {
        hint.textContent = items.length
          ? "El envío y cupones se calculan al finalizar."
          : "Agregá productos desde el menú.";
        hint.classList.remove("is-warn");
      }
    }

    if (!items.length) {
      els.cartItems.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M6 7h15l-1.4 8.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.6L5.2 4.5A2 2 0 0 0 3.3 3H2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="10" cy="20" r="1.3" fill="currentColor" stroke="none"/>
              <circle cx="18" cy="20" r="1.3" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <h3>Tu carrito está vacío</h3>
          <p>Explorá el menú y sumá tus hamburguesas favoritas.</p>
          <button type="button" class="btn btn--primary btn--sm" data-close-cart data-go-menu>Ver menú</button>
        </div>`;
      return;
    }

    els.cartItems.innerHTML = items
      .map(
        (it) => `
      <article class="cart-line" data-cart-id="${escapeHtml(it.productId)}">
        <div class="cart-line__media">
          <img src="${escapeHtml(it.imageUrl || "/burger-nick-logo.png")}" alt="${escapeHtml(it.name)}" onerror="this.onerror=null;this.src='/burger-nick-logo.png'" />
        </div>
        <div class="cart-line__body">
          <div class="cart-line__top">
            <strong>${escapeHtml(it.name)}</strong>
            <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(it.productId)}" aria-label="Quitar ${escapeHtml(it.name)}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M5 7h14M10 11v6M14 11v6M9 7V5h6v2M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <span class="cart-line__unit">${formatMoney(it.unitPrice)} c/u</span>
          <div class="cart-line__bottom">
            <div class="cart-line__qty" role="group" aria-label="Cantidad">
              <button type="button" class="cart-qty-btn" data-cart-dec="${escapeHtml(it.productId)}" aria-label="Menos">−</button>
              <span aria-live="polite">${it.quantity}</span>
              <button type="button" class="cart-qty-btn" data-cart-inc="${escapeHtml(it.productId)}" aria-label="Más">+</button>
            </div>
            <strong class="cart-line__total">${formatMoney(it.unitPrice * it.quantity)}</strong>
          </div>
        </div>
      </article>`
      )
      .join("");
  }

  function addProductToCart(product) {
    if (!product) {
      showToast("Producto no disponible", "error");
      return;
    }
    if (product.soldOut || product.available === false) {
      showToast("Este producto está agotado", "error");
      return;
    }
    if (!Cart.add(product, 1)) {
      showToast(
        "Podés combinar hasta 3 productos distintos por pedido. Ajustá cantidades desde el carrito.",
        "info"
      );
      return;
    }
    showToast(`${product.name} agregado al carrito`, "success");
    // Solo actualiza badge; el drawer se abre únicamente al tocar el ícono
    if (isCartOpen()) renderCartDrawer();
  }

  /** Abre el checkout solo si el carrito tiene productos. */
  function open() {
    cacheEls();
    if (Cart.isEmpty()) {
      showToast("Agregá productos al carrito para continuar", "error");
      closeCart();
      document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    closeCart();
    reset();
    renderCartPreview();
    showStep(1);
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", trapFocus);
    document.getElementById("oFirstName")?.focus();
  }

  function close() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", trapFocus);
    destroyOrderMap();
  }

  function trapFocus(e) {
    if (e.key !== "Tab" || !els.modal || els.modal.hidden) return;
    const focusable = els.modal.querySelectorAll(
      'button:not([hidden]):not([disabled]), [href], input:not([hidden]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = [...focusable].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function reset() {
    state.step = 1;
    state.customer = { firstName: "", lastName: "", whatsapp: "", email: "", notes: "" };
    state.payment = "Mercado Pago";
    state.deliveryMethod = "pickup";
    state.clientLat = null;
    state.clientLng = null;
    state.address = "";
    state.distanceKm = 0;
    state.deliveryCost = 0;
    state.coupon = null;
    state.couponCode = "";
    state.discount = 0;
    state.orderNumber = null;
    state.saving = false;
    state.lastOrderItems = [];
    state.lastOrderTotals = null;

    document.getElementById("step1")?.reset();
    const couponInput = document.getElementById("oCoupon");
    if (couponInput) couponInput.value = "";
    setCouponMsg("");
    document.querySelectorAll(".field-error").forEach((element) => {
      element.textContent = "";
    });
    document.querySelectorAll("input.is-invalid").forEach((element) => {
      element.classList.remove("is-invalid");
    });
    const pay = document.querySelector('input[name="payment"][value="Mercado Pago"]');
    if (pay) pay.checked = true;
    const pickup = document.querySelector('input[name="delivery"][value="pickup"]');
    if (pickup) pickup.checked = true;
    if (els.deliveryPanel) els.deliveryPanel.hidden = true;
  }

  function setCouponMsg(text, type = "") {
    const msg = document.getElementById("couponMsg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.classList.toggle("is-ok", type === "ok");
    msg.classList.toggle("is-error", type === "error");
  }

  function clearCoupon() {
    state.coupon = null;
    state.couponCode = "";
    state.discount = 0;
  }

  async function applyCouponFromInput() {
    const input = document.getElementById("oCoupon");
    const code = input?.value.trim().toUpperCase() || "";
    if (!code) {
      clearCoupon();
      setCouponMsg("Ingresá un código de cupón.", "error");
      return false;
    }
    try {
      const coupon = await getCouponByCode(code);
      const ship = state.deliveryMethod === "delivery" ? state.deliveryCost : 0;
      const check = validateCoupon(coupon, {
        subtotal: getSubtotal(),
        shipping: ship,
      });
      if (!check.ok) {
        clearCoupon();
        setCouponMsg(check.error, "error");
        showToast(check.error, "error");
        return false;
      }
      state.coupon = check.coupon;
      state.couponCode = check.coupon.code;
      state.discount = check.discount;
      if (input) input.value = check.coupon.code;
      const label =
        check.coupon.freeShipping && check.discount <= 0
          ? "Cupón aplicado: envío gratis"
          : `Cupón ${check.coupon.code} aplicado (−${formatMoney(check.discount)})`;
      setCouponMsg(label, "ok");
      showToast("Cupón aplicado", "success");
      return true;
    } catch (err) {
      clearCoupon();
      const message = err?.message || "No se pudo validar el cupón.";
      setCouponMsg(message, "error");
      showToast(message, "error");
      return false;
    }
  }

  function revalidateAppliedCoupon() {
    if (!state.coupon) {
      state.discount = 0;
      return true;
    }
    const ship = state.deliveryMethod === "delivery" ? state.deliveryCost : 0;
    const check = validateCoupon(state.coupon, {
      subtotal: getSubtotal(),
      shipping: ship,
    });
    if (!check.ok) {
      clearCoupon();
      setCouponMsg(check.error, "error");
      showToast(check.error, "error");
      return false;
    }
    state.discount = check.discount;
    return true;
  }

  function getDiscount() {
    if (!state.coupon) return 0;
    const shipBefore = state.deliveryMethod === "delivery" ? state.deliveryCost : 0;
    const check = validateCoupon(state.coupon, {
      subtotal: getSubtotal(),
      shipping: shipBefore,
    });
    return check.ok ? check.discount : 0;
  }

  function getShipAfterCoupon() {
    if (state.deliveryMethod !== "delivery") return 0;
    if (!state.coupon) return state.deliveryCost;
    const check = validateCoupon(state.coupon, {
      subtotal: getSubtotal(),
      shipping: state.deliveryCost,
    });
    return check.ok ? check.shippingAfter : state.deliveryCost;
  }

  function renderCartPreview() {
    if (!els.preview) return;
    const items = cartLines();
    if (!items.length) {
      els.preview.hidden = true;
      els.preview.innerHTML = "";
      return;
    }
    els.preview.hidden = false;
    els.preview.innerHTML = `
      <div class="order-cart-preview">
        <strong>Tu carrito (${Cart.count()})</strong>
        <ul>
          ${items
            .map(
              (it) =>
                `<li><span>${escapeHtml(it.name)} × ${it.quantity}</span><span>${formatMoney(
                  it.unitPrice * it.quantity
                )}</span></li>`
            )
            .join("")}
        </ul>
        <div class="order-cart-preview__total"><span>Subtotal</span><strong>${formatMoney(
          getSubtotal()
        )}</strong></div>
      </div>
    `;
  }

  function showStep(step) {
    state.step = step;
    els.stepPanels.forEach((panel) => {
      const key = panel.dataset.step;
      panel.hidden = !((step === "confirm" && key === "confirm") || String(key) === String(step));
    });
    els.steps.forEach((item) => {
      const n = Number(item.dataset.stepIndicator);
      item.classList.toggle("is-active", step !== "confirm" && n === step);
      item.classList.toggle("is-done", step === "confirm" || n < step);
    });

    if (step === "confirm") {
      els.title.textContent = "Pedido confirmado";
      els.modalFoot.hidden = true;
    } else {
      els.title.textContent = "Finalizar pedido";
      els.modalFoot.hidden = false;
      els.btnPrev.hidden = step === 1;
      els.btnNext.textContent = step === 4 ? "Finalizar Compra" : "Continuar";
      els.btnNext.disabled = false;
    }

    if (step === 3) syncDeliveryUI();
    if (step === 4) renderSummary();
  }

  function validateStep1() {
    if (Cart.isEmpty()) {
      showToast("Tu carrito está vacío", "error");
      close();
      document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
      return false;
    }

    const firstName = document.getElementById("oFirstName");
    const lastName = document.getElementById("oLastName");
    const whatsapp = document.getElementById("oWhatsapp");
    const email = document.getElementById("oEmail");
    const notes = document.getElementById("oNotes");

    const rules = [
      { el: firstName, ok: firstName.value.trim().length >= 2, msg: "Nombre inválido." },
      { el: lastName, ok: lastName.value.trim().length >= 2, msg: "Apellido inválido." },
      {
        el: whatsapp,
        ok: /^[0-9]{8,15}$/.test(normalizePhone(whatsapp.value)),
        msg: "WhatsApp inválido (8 a 15 dígitos).",
      },
      {
        el: email,
        ok: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()),
        msg: "Email inválido.",
      },
    ];

    let valid = true;
    rules.forEach(({ el, ok, msg }) => {
      const err = document.querySelector(`[data-error-for="${el.id}"]`);
      el.classList.toggle("is-invalid", !ok);
      if (err) err.textContent = ok ? "" : msg;
      if (!ok) valid = false;
    });

    if (!valid) {
      showToast("Revisá los datos personales.", "error");
      return false;
    }

    const minOrder = Number(settings().shipping?.minOrderAmount || 0);
    if (minOrder > 0 && getSubtotal() < minOrder) {
      showToast(`El pedido mínimo es ${formatMoney(minOrder)}.`, "error");
      return false;
    }

    state.customer = {
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      whatsapp: normalizePhone(whatsapp.value),
      email: email.value.trim().toLowerCase(),
      notes: notes?.value.trim() || "",
    };
    return true;
  }

  async function validateStep2() {
    const selected = document.querySelector('input[name="payment"]:checked');
    if (!selected) {
      showToast("Elegí un método de pago.", "error");
      return false;
    }
    state.payment = selected.value;

    const input = document.getElementById("oCoupon");
    const typed = input?.value.trim() || "";
    if (typed) {
      const ok = await applyCouponFromInput();
      if (!ok) return false;
    } else {
      clearCoupon();
      setCouponMsg("");
    }
    return true;
  }

  function validateStep3() {
    const selected = document.querySelector('input[name="delivery"]:checked');
    if (!selected) {
      showToast("Elegí un método de entrega.", "error");
      return false;
    }
    state.deliveryMethod = selected.value;
    const addressEl = document.getElementById("oAddress");
    state.address = addressEl?.value.trim() || "";
    const addrErr = document.querySelector('[data-error-for="oAddress"]');

    if (state.deliveryMethod === "pickup") {
      state.distanceKm = 0;
      state.deliveryCost = 0;
      state.clientLat = null;
      state.clientLng = null;
      addressEl?.classList.remove("is-invalid");
      if (addrErr) addrErr.textContent = "";
      return true;
    }

    const addrOk = state.address.length >= 5;
    addressEl?.classList.toggle("is-invalid", !addrOk);
    if (addrErr) addrErr.textContent = addrOk ? "" : "Indicá calle, número y barrio.";
    if (!addrOk) {
      showToast("Completá la dirección de entrega.", "error");
      addressEl?.focus();
      return false;
    }

    if (state.clientLat == null || state.clientLng == null) {
      els.deliveryMeta.innerHTML = "<p>Marcá tu ubicación en el mapa.</p>";
      showToast("Marcá tu ubicación en el mapa.", "error");
      return false;
    }

    const max = Number(settings().shipping?.maxRadiusKm || 15);
    if (state.distanceKm > max) {
      els.deliveryMeta.innerHTML = `<p>Fuera del radio de delivery (${max} km).</p>`;
      showToast(`Fuera del radio de delivery (${max} km).`, "error");
      return false;
    }
    return true;
  }

  function syncDeliveryUI() {
    const selected = document.querySelector('input[name="delivery"]:checked');
    state.deliveryMethod = selected ? selected.value : "pickup";
    const isDelivery = state.deliveryMethod === "delivery";
    els.deliveryPanel.hidden = !isDelivery;
    if (isDelivery) requestAnimationFrame(() => initOrderMap());
    else {
      state.deliveryCost = 0;
      state.distanceKm = 0;
      destroyOrderMap();
    }
  }

  function initOrderMap() {
    if (!window.L || !els.orderMap) return;
    const storeCfg = settings().store || { lat: -27.91125, lng: -55.75624, zoom: 16, label: "BURGER NICK" };
    const { lat, lng, zoom = 14 } = storeCfg;
    const label = /loli/i.test(storeCfg.label || "") ? "BURGER NICK" : storeCfg.label || "BURGER NICK";

    if (!state.orderMap) {
      state.orderMap = L.map(els.orderMap).setView([lat, lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(state.orderMap);

      const storeIcon = L.divIcon({
        className: "",
        html: '<span class="store-marker"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      state.storeMarker = L.marker([lat, lng], { icon: storeIcon }).addTo(state.orderMap).bindPopup(label);
      state.orderMap.on("click", (e) => setClientLocation(e.latlng.lat, e.latlng.lng));
    }

    setTimeout(() => state.orderMap.invalidateSize(), 120);
    if (state.clientLat != null) setClientLocation(state.clientLat, state.clientLng);
    else els.deliveryMeta.innerHTML = "<p>Seleccioná un punto en el mapa.</p>";
  }

  function setClientLocation(lat, lng) {
    state.clientLat = lat;
    state.clientLng = lng;
    const clientIcon = L.divIcon({
      className: "",
      html: '<span class="client-marker"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    if (state.clientMarker) state.clientMarker.setLatLng([lat, lng]);
    else state.clientMarker = L.marker([lat, lng], { icon: clientIcon }).addTo(state.orderMap);

    const storeCfg = settings().store || { lat: -27.91125, lng: -55.75624 };
    state.distanceKm = haversineKm(storeCfg.lat, storeCfg.lng, lat, lng);
    state.deliveryCost = resolveDeliveryCost(state.distanceKm);

    if (state.routeLine) state.orderMap.removeLayer(state.routeLine);
    state.routeLine = L.polyline(
      [
        [storeCfg.lat, storeCfg.lng],
        [lat, lng],
      ],
      { color: "#d8c6a5", weight: 3, opacity: 0.85, dashArray: "6 8" }
    ).addTo(state.orderMap);
    state.orderMap.fitBounds(state.routeLine.getBounds(), { padding: [40, 40] });

    const max = Number(settings().shipping?.maxRadiusKm || 15);
    const over = state.distanceKm > max;
    els.deliveryMeta.innerHTML = `
      <p>Distancia estimada: <strong>${state.distanceKm.toFixed(2)} km</strong></p>
      <p>Costo delivery: <strong>${formatMoney(state.deliveryCost)}</strong></p>
      <p>Total estimado: <strong>${formatMoney(getSubtotal() + state.deliveryCost)}</strong></p>
      ${over ? `<p style="color:#ff8d8d">Fuera del radio (${max} km).</p>` : ""}
    `;
  }

  function resolveDeliveryCost(distanceKm) {
    const ship = settings().shipping || {};
    let cost = calcDeliveryCost(distanceKm, settings());
    if (ship.freeShippingEnabled && getSubtotal() >= Number(ship.freeShippingMin || 0)) {
      cost = 0;
    }
    return cost;
  }

  function destroyOrderMap() {
    if (state.orderMap) {
      state.orderMap.remove();
      state.orderMap = null;
      state.storeMarker = null;
      state.clientMarker = null;
      state.routeLine = null;
    }
  }

  function getShip() {
    return getShipAfterCoupon();
  }

  function getShipBeforeCoupon() {
    return state.deliveryMethod === "delivery" ? state.deliveryCost : 0;
  }

  function getTotal() {
    return Math.max(0, getSubtotal() + getShip() - getDiscount());
  }

  /** Totales del pedido ya confirmado (el carrito se vacía antes de la UI final). */
  function getConfirmedTotals() {
    if (state.lastOrderTotals) return state.lastOrderTotals;
    const subtotal = getSubtotal();
    const deliveryCost = getShip();
    const discount = getDiscount();
    return {
      subtotal,
      deliveryCost,
      discount,
      total: Math.max(0, subtotal + deliveryCost - discount),
    };
  }

  function getDeliveryLabel() {
    return state.deliveryMethod === "delivery" ? "Delivery" : "Retirar en el local";
  }

  function renderSummary() {
    revalidateAppliedCoupon();
    const discount = getDiscount();
    const items = cartLines();
    const addressRow =
      state.deliveryMethod === "delivery"
        ? `<div class="checkout__row"><span>Dirección</span><span>${escapeHtml(state.address)}</span></div>
           <div class="checkout__row"><span>Distancia</span><span>${state.distanceKm.toFixed(2)} km</span></div>`
        : "";
    const couponRow = state.coupon
      ? `<div class="checkout__row checkout__row--discount"><span>Cupón (${escapeHtml(state.coupon.code)})</span><span>−${formatMoney(discount)}</span></div>`
      : "";
    const shipLabel =
      state.coupon?.freeShipping && getShipBeforeCoupon() > 0
        ? `${formatMoney(0)} <small>(gratis)</small>`
        : formatMoney(getShip());
    const itemsHtml = items
      .map(
        (it) =>
          `<div class="checkout__row"><span>${escapeHtml(it.name)} × ${it.quantity}</span><span>${formatMoney(
            it.unitPrice * it.quantity
          )}</span></div>`
      )
      .join("");

    els.summary.innerHTML = `
      <div class="checkout__rows">
        ${itemsHtml}
        <div class="checkout__row"><span>Subtotal</span><span>${formatMoney(getSubtotal())}</span></div>
        <div class="checkout__row"><span>Costo envío</span><span>${shipLabel}</span></div>
        ${couponRow}
        <div class="checkout__row"><span>Método de pago</span><span>${escapeHtml(state.payment)}</span></div>
        <div class="checkout__row"><span>Método de entrega</span><span>${getDeliveryLabel()}</span></div>
        ${
          Number(settings().shipping?.estimatedMinutes)
            ? `<div class="checkout__row"><span>Tiempo estimado</span><span>~${Number(
                settings().shipping.estimatedMinutes
              )} min</span></div>`
            : ""
        }
        ${addressRow}
      </div>
      <div class="checkout__total"><span>Total</span><span>${formatMoney(getTotal())}</span></div>
    `;
  }

  async function finalize() {
    let items = cartLines();
    if (!items.length) {
      showToast("Tu carrito está vacío", "error");
      close();
      document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (state.saving) return;
    state.saving = true;
    els.btnNext.disabled = true;
    els.btnNext.textContent = "Procesando...";

    try {
      const catalogCheck = Cart.syncWithCatalog(store.products);
      if (catalogCheck.changed) {
        items = cartLines();
        renderCart();
        renderSummary();
        const removedText = catalogCheck.removed.length
          ? ` Se quitaron: ${catalogCheck.removed.join(", ")}.`
          : "";
        throw new Error(
          `El menú cambió desde que armaste el carrito.${removedText} Revisá precios y productos antes de confirmar.`
        );
      }
      if (!revalidateAppliedCoupon()) {
        throw new Error("El cupón ya no es válido. Revisalo e intentá de nuevo.");
      }
      const discount = getDiscount();
      const shipBefore = getShipBeforeCoupon();
      const shipAfter = getShip();
      const lineItems = items.map((it) => ({
        productId: it.productId,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        category: it.category || "",
      }));
      const payload = {
        firstName: state.customer.firstName,
        lastName: state.customer.lastName,
        phone: state.customer.whatsapp,
        email: state.customer.email,
        address:
          state.deliveryMethod === "delivery"
            ? state.address || `Lat ${state.clientLat?.toFixed(5)}, Lng ${state.clientLng?.toFixed(5)}`
            : "Retiro en el local",
        notes: state.customer.notes || "",
        observations: state.customer.notes || "",
        productName: lineItems.map((i) => `${i.name} x${i.quantity}`).join(", "),
        productId: lineItems[0].productId,
        quantity: lineItems.reduce((s, i) => s + i.quantity, 0),
        unitPrice: lineItems[0].unitPrice,
        items: lineItems,
        subtotal: getSubtotal(),
        deliveryCost: shipAfter,
        deliveryCostBeforeCoupon: shipBefore,
        discount,
        total: getTotal(),
        couponId: state.coupon?.id || null,
        couponCode: state.coupon?.code || "",
        paymentMethod: state.payment,
        deliveryMethod: getDeliveryLabel(),
        clientLat: state.clientLat,
        clientLng: state.clientLng,
        distanceKm: state.distanceKm || 0,
      };

      const result = await createOrderFromCheckout(payload);
      const finalSubtotal = Number(result.orderData?.subtotal ?? payload.subtotal) || 0;
      const finalDelivery = Number(result.deliveryCost ?? shipAfter) || 0;
      const finalDiscount = Number(result.discount ?? discount) || 0;
      const finalTotal = Number(
        result.total ?? Math.max(0, finalSubtotal + finalDelivery - finalDiscount)
      );

      state.orderNumber = result.orderNumber;
      state.discount = finalDiscount;
      state.lastOrderItems = result.orderData?.items || lineItems;
      state.lastOrderTotals = {
        subtotal: finalSubtotal,
        deliveryCost: finalDelivery,
        discount: finalDiscount,
        total: finalTotal,
      };
      Cart.clear();
      renderCartBadge();
      renderConfirmation();
      showStep("confirm");
      showToast("Pedido guardado correctamente", "success");
    } catch (err) {
      showToast(err?.message || "No se pudo crear el pedido. Intentá de nuevo.", "error");
      els.btnNext.disabled = false;
      els.btnNext.textContent = "Finalizar Compra";
    } finally {
      state.saving = false;
    }
  }

  function needsPaymentData() {
    return ["Mercado Pago", "Transferencia", "Tarjeta"].includes(state.payment);
  }

  function buildWhatsAppMessage() {
    const fullName = `${state.customer.firstName} ${state.customer.lastName}`;
    const items = state.lastOrderItems.length ? state.lastOrderItems : cartLines();
    const totals = getConfirmedTotals();
    const lines = [
      "Hola Burger Nick",
      "",
      "Quiero enviar el comprobante de mi pedido.",
      "",
      `Número de pedido: ${state.orderNumber}`,
      `Estado: Pendiente`,
      `Cliente: ${fullName}`,
      `WhatsApp: ${state.customer.whatsapp}`,
      `Email: ${state.customer.email}`,
      "",
      "Productos:",
      ...items.map((it) => `• ${it.name} x${it.quantity} — ${formatMoney(it.unitPrice * it.quantity)}`),
      "",
      `Entrega: ${getDeliveryLabel()}`,
    ];
    if (state.deliveryMethod === "delivery") {
      lines.push(`Dirección: ${state.address}`);
      if (state.distanceKm) lines.push(`Distancia: ${state.distanceKm.toFixed(2)} km`);
    }
    lines.push(
      `Método de pago: ${state.payment}`,
      `Subtotal: ${formatMoney(totals.subtotal)}`,
      `Envío: ${formatMoney(totals.deliveryCost)}`
    );
    if (state.coupon || totals.discount > 0) {
      const code = state.coupon?.code || state.couponCode || "Cupón";
      lines.push(`Cupón: ${code} (−${formatMoney(totals.discount)})`);
    }
    lines.push(`Total: ${formatMoney(totals.total)}`, "", "Adjunto el comprobante de pago.");
    if (state.customer.notes) lines.push("", `Observaciones: ${state.customer.notes}`);
    return lines.join("\n");
  }

  function getWhatsAppUrl() {
    return `https://wa.me/${getWhatsAppNumber(settings())}?text=${encodeURIComponent(buildWhatsAppMessage())}`;
  }

  function paymentRowsHtml(pay) {
    const rows = [];
    if (pay.alias) {
      rows.push(`
        <div class="payment-row">
          <div><span>Alias</span><strong>${escapeHtml(pay.alias)}</strong></div>
          <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(pay.alias)}">Copiar</button>
        </div>`);
    }
    if (pay.cbu) {
      rows.push(`
        <div class="payment-row">
          <div><span>CBU / CVU</span><strong>${escapeHtml(pay.cbu)}</strong></div>
          <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(pay.cbu)}">Copiar</button>
        </div>`);
    }
    if (pay.holder) {
      rows.push(`
        <div class="payment-row">
          <div><span>Titular</span><strong>${escapeHtml(pay.holder)}</strong></div>
        </div>`);
    }
    return rows.join("");
  }

  function renderConfirmation() {
    const fullName = `${state.customer.firstName} ${state.customer.lastName}`;
    const pay = settings()?.payment || {};
    const msg = settings()?.messages?.received || "Tu pedido fue recibido correctamente.";
    const items = state.lastOrderItems;
    const itemsLabel = items.map((i) => `${i.name} ×${i.quantity}`).join(", ");
    const hasPayData = Boolean(pay.alias || pay.cbu || pay.holder);
    const showPayBox = needsPaymentData();
    const totals = getConfirmedTotals();
    const totalLabel = formatMoney(totals.total);
    const couponCode = state.coupon?.code || state.couponCode || "";

    const paymentBlock = showPayBox
      ? `
        <div class="payment-box">
          <h4>Datos para transferir</h4>
          <p class="payment-box__lead">Transferí <strong>${totalLabel}</strong> y enviá el comprobante por WhatsApp.</p>
          ${paymentRowsHtml(pay)}
          ${
            !hasPayData
              ? `<p class="payment-box__fallback">Todavía no hay alias/CBU cargados en el panel. Escribinos por WhatsApp y te pasamos los datos al instante.</p>`
              : ""
          }
          <div class="payment-row payment-row--order">
            <div><span>Número de pedido</span><strong>${escapeHtml(state.orderNumber)}</strong></div>
            <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(state.orderNumber)}">Copiar</button>
          </div>
          <div class="payment-row">
            <div><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
          </div>
          <div class="payment-row">
            <div><span>Envío</span><strong>${formatMoney(totals.deliveryCost)}</strong></div>
          </div>
          ${
            totals.discount > 0
              ? `<div class="payment-row"><div><span>Descuento</span><strong>−${formatMoney(totals.discount)}</strong></div></div>`
              : ""
          }
          <div class="payment-row">
            <div><span>Total a pagar</span><strong>${totalLabel}</strong></div>
          </div>
          <div class="payment-row">
            <div><span>Estado</span><strong>Pendiente</strong></div>
          </div>
        </div>
        <p class="confirm__msg">Al abrir WhatsApp podés adjuntar la foto o PDF del comprobante en el chat.</p>
      `
      : `
        <div class="payment-box payment-box--simple">
          <h4>Pedido registrado</h4>
          <p class="payment-box__lead">${escapeHtml(msg)}</p>
          <div class="payment-row payment-row--order">
            <div><span>Número de pedido</span><strong>${escapeHtml(state.orderNumber)}</strong></div>
            <button type="button" class="btn btn--ghost btn--sm" data-copy="${escapeHtml(state.orderNumber)}">Copiar</button>
          </div>
          <div class="payment-row">
            <div><span>Total</span><strong>${totalLabel}</strong></div>
          </div>
          <div class="payment-row">
            <div><span>Estado</span><strong>Pendiente</strong></div>
          </div>
        </div>
      `;

    els.confirm.innerHTML = `
      <div class="confirm__ok">✓ Pedido generado correctamente</div>
      <h3>¡Gracias, ${escapeHtml(state.customer.firstName)}!</h3>
      <span class="confirm__order">${escapeHtml(state.orderNumber)}</span>
      <div class="confirm__grid">
        <p><span>Nombre</span><strong>${escapeHtml(fullName)}</strong></p>
        <p><span>Productos</span><strong>${escapeHtml(itemsLabel)}</strong></p>
        <p><span>Entrega</span><strong>${getDeliveryLabel()}</strong></p>
        <p><span>Pago</span><strong>${escapeHtml(state.payment)}</strong></p>
        ${
          couponCode
            ? `<p><span>Cupón</span><strong>${escapeHtml(couponCode)}${
                totals.discount > 0 ? ` (−${formatMoney(totals.discount)})` : ""
              }</strong></p>`
            : ""
        }
        <p><span>Total</span><strong>${totalLabel}</strong></p>
      </div>
      ${paymentBlock}
      <div class="confirm__actions">
        <a class="btn btn--primary" href="${getWhatsAppUrl()}" target="_blank" rel="noopener noreferrer">
          ${showPayBox ? "Enviar comprobante por WhatsApp" : "Confirmar por WhatsApp"}
        </a>
        <button type="button" class="btn btn--ghost" data-close-modal>Cerrar</button>
      </div>
    `;

    els.confirm.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const value = btn.getAttribute("data-copy") || "";
        try {
          await navigator.clipboard.writeText(value);
          const prev = btn.textContent;
          btn.textContent = "Copiado";
          setTimeout(() => {
            btn.textContent = prev;
          }, 1400);
          showToast("Copiado al portapapeles", "success");
        } catch {
          showToast("No se pudo copiar", "error");
        }
      });
    });
  }

  async function next() {
    if (state.step === 1 && !validateStep1()) return;
    if (state.step === 2 && !(await validateStep2())) return;
    if (state.step === 3 && !validateStep3()) return;
    if (state.step === 4) {
      await finalize();
      return;
    }
    showStep(state.step + 1);
  }

  function prev() {
    if (state.step === 1 || state.step === "confirm") return;
    showStep(state.step - 1);
  }

  function bind() {
    cacheEls();
    Cart.subscribe(() => {
      renderCartBadge();
      if (isCartOpen()) renderCartDrawer();
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-cart]")) {
        e.preventDefault();
        openCart();
        return;
      }
      if (e.target.closest("[data-close-cart]")) {
        e.preventDefault();
        const goMenu = e.target.closest("[data-go-menu]");
        closeCart();
        if (goMenu) {
          document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }
      if (e.target.closest("[data-open-order]")) {
        e.preventDefault();
        if (Cart.isEmpty()) {
          document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
          showToast("Elegí productos del menú y agregalos al carrito", "info");
          return;
        }
        // Pedir Ahora va al checkout; el drawer solo se abre con el ícono
        open();
        return;
      }
      if (e.target.closest("#cartCheckoutBtn")) {
        e.preventDefault();
        open();
        return;
      }
      if (e.target.closest("#cartClearBtn")) {
        e.preventDefault();
        if (Cart.isEmpty()) return;
        Cart.clear();
        showToast("Carrito vaciado", "success");
        renderCartDrawer();
        return;
      }
      if (e.target.closest("[data-close-modal]")) {
        close();
        return;
      }

      const addBtn = e.target.closest("[data-add-cart]");
      if (addBtn) {
        const product = getProductById(addBtn.getAttribute("data-add-cart"));
        addProductToCart(product);
        return;
      }

      const inc = e.target.closest("[data-cart-inc]");
      if (inc) {
        const id = inc.getAttribute("data-cart-inc");
        const item = Cart.getItems().find((it) => it.productId === id);
        Cart.setQty(id, (item?.quantity || 0) + 1);
        return;
      }
      const dec = e.target.closest("[data-cart-dec]");
      if (dec) {
        const id = dec.getAttribute("data-cart-dec");
        const item = Cart.getItems().find((it) => it.productId === id);
        Cart.setQty(id, (item?.quantity || 0) - 1);
        return;
      }
      const rem = e.target.closest("[data-cart-remove]");
      if (rem) {
        Cart.remove(rem.getAttribute("data-cart-remove"));
      }
    });

    els.btnNext?.addEventListener("click", () => next());
    els.btnPrev?.addEventListener("click", prev);
    document.getElementById("btnApplyCoupon")?.addEventListener("click", () => {
      applyCouponFromInput();
    });
    document.getElementById("oCoupon")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyCouponFromInput();
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target.name === "delivery" && state.step === 3) syncDeliveryUI();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && isCartOpen()) {
        const focusable = [
          ...els.cartDrawer.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ),
        ];
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      if (e.key === "Escape") {
        if (els.modal && !els.modal.hidden) close();
        else if (isCartOpen()) closeCart();
      }
    });

    renderCartBadge();
  }

  return { bind, open, close, openCart, closeCart, addProductToCart };
})();
