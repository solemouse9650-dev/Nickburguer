import { listenAvailableProducts } from "../services/products.js";
import { listenActivePromotions } from "../services/promotions.js";
import { formatHoursText, listenSettings } from "../services/settings.js";
import {
  escapeHtml,
  formatMoney,
  getWhatsAppNumber,
  productUnitPrice,
} from "../utils/format.js";
import { showToast } from "../utils/toast.js";
import { FAQ_ITEMS } from "./faq.js";
import { OrderFlow } from "./order.js";
import { store } from "./store.js";

const FALLBACK_IMG = "/burger-nick-logo.png";
let currentFilter = "all";
let contactMap = null;
let contactMarker = null;

document.addEventListener("DOMContentLoaded", () => {
  setupFilters();
  setupHeader();
  setupNav();
  renderFaq();
  setupContactForm();
  setupReveal();
  setupHeroParallax();
  OrderFlow.bind();
  showMenuLoading();
  showGalleryLoading();

  listenSettings(
    (settings) => {
      store.settings = settings;
      applySettings(settings);
    },
    () => {
      showToast("No se pudo cargar la configuración. Reintentá en unos segundos.", "error");
    }
  );

  listenAvailableProducts(
    (products) => {
      store.products = products;
      renderMenu(currentFilter);
      renderGallery(products);
      updateAboutImage(products);
    },
    () => {
      const grid = document.getElementById("menuGrid");
      if (grid) {
        grid.innerHTML = `<div class="empty-menu">
          No pudimos cargar el menú en este momento.<br />
          <a class="btn btn--primary btn--sm" style="margin-top:1rem" href="https://wa.me/5493765130819" target="_blank" rel="noopener">Pedir por WhatsApp</a>
        </div>`;
      }
      showToast("Error al cargar el menú.", "error");
    }
  );

  listenActivePromotions(
    (promotions) => {
      store.promotions = promotions;
      renderPromos();
    },
    () => {
      const grid = document.getElementById("promosGrid");
      if (grid) grid.innerHTML = `<div class="empty-menu">Promociones no disponibles por ahora.</div>`;
    }
  );
});

function showMenuLoading() {
  const grid = document.getElementById("menuGrid");
  if (grid) grid.innerHTML = `<div class="menu-loading" role="status">Cargando menú...</div>`;
}

function showGalleryLoading() {
  const grid = document.getElementById("galleryGrid");
  if (grid) grid.innerHTML = `<div class="menu-loading" role="status">Cargando galería...</div>`;
}

function imgWithFallback(src, alt) {
  const safe = src || FALLBACK_IMG;
  return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy" width="800" height="600" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'" />`;
}

function applySettings(settings) {
  const business = settings.business || {};
  const contact = settings.contact || {};
  const social = settings.social || {};
  const branding = settings.branding || {};
  const storeCfg = settings.store || {};

  document.querySelectorAll(".header__name").forEach((el) => {
    el.textContent = cleanLegacyText(business.name, "Burger Nick");
  });
  document.querySelectorAll(".header__tag").forEach((el) => {
    el.textContent = cleanLegacyText(business.slogan, "Since 2024");
  });

  const logoUrl =
    branding.logoUrl && !/loliiii|loli.?burger/i.test(branding.logoUrl)
      ? branding.logoUrl
      : FALLBACK_IMG;
  document
    .querySelectorAll(".header__logo, .hero__logo, .about__badge, .footer__brand img")
    .forEach((img) => {
      img.src = logoUrl;
    });

  if (branding.faviconUrl && !/loliiii|loli.?burger/i.test(branding.faviconUrl)) {
    const fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.href = branding.faviconUrl;
  }

  const heroImg = document.getElementById("heroBgImage");
  if (heroImg && branding.heroUrl && branding.heroUrl !== FALLBACK_IMG && !branding.heroUrl.includes("unsplash")) {
    heroImg.hidden = false;
    heroImg.src = branding.heroUrl;
    heroImg.onerror = () => {
      heroImg.hidden = true;
    };
  } else if (heroImg) {
    heroImg.hidden = true;
  }

  if (branding.primaryColor) {
    document.documentElement.style.setProperty("--gold", branding.primaryColor);
    document.documentElement.style.setProperty("--yellow", branding.primaryColor);
  }
  if (branding.secondaryColor) {
    document.documentElement.style.setProperty("--celeste", branding.secondaryColor);
  }

  const aboutDesc = document.getElementById("aboutDescription");
  if (aboutDesc && business.description) {
    aboutDesc.textContent = cleanLegacyText(
      business.description,
      "Burger Nick nació para transformar una hamburguesa en una experiencia. Combinamos ingredientes seleccionados, cocina al momento y una estética simple para que el sabor sea siempre protagonista."
    );
  }

  const mission = document.getElementById("aboutMission");
  const vision = document.getElementById("aboutVision");
  const quality = document.getElementById("aboutQuality");
  if (mission && settings.about?.mission) mission.textContent = settings.about.mission;
  if (vision && settings.about?.vision) vision.textContent = settings.about.vision;
  if (quality && settings.about?.quality) quality.textContent = settings.about.quality;

  const address = [business.address, business.city, business.province].filter(Boolean).join(", ");
  setText("contactAddress", address || "Consultá la dirección por WhatsApp");

  const mapsLink = document.getElementById("contactMapsLink");
  if (mapsLink) {
    const url =
      storeCfg.mapsUrl ||
      (storeCfg.lat && storeCfg.lng
        ? `https://www.google.com/maps?q=${storeCfg.lat},${storeCfg.lng}`
        : "");
    if (url) {
      mapsLink.hidden = false;
      mapsLink.href = url;
    } else {
      mapsLink.hidden = true;
    }
  }
  setText("contactHours", formatHoursText(settings.hours));
  setText("footerYear", String(new Date().getFullYear()));
  setText(
    "footerTagline",
    cleanLegacyText(business.description, "Sabor sin excesos. Calidad sin atajos.")
  );

  const waUrl = `https://wa.me/${getWhatsAppNumber(settings)}?text=${encodeURIComponent(
    "Hola Burger Nick, quiero hacer una consulta."
  )}`;
  const waLink = document.getElementById("contactWhatsapp");
  if (waLink) {
    waLink.href = waUrl;
    waLink.textContent = contact.whatsappPrimary || contact.whatsapp || "WhatsApp";
  }
  const secondaryNumber = String(contact.whatsappSecondary || "").replace(/\D/g, "");
  const secondaryLink = document.getElementById("contactWhatsappSecondary");
  if (secondaryLink) {
    secondaryLink.hidden = !secondaryNumber;
    if (secondaryNumber) {
      const countryCode = contact.whatsappCountryCode || "54";
      const international = secondaryNumber.startsWith(countryCode)
        ? secondaryNumber
        : `${countryCode}9${secondaryNumber}`;
      secondaryLink.href = `https://wa.me/${international}`;
      secondaryLink.textContent = secondaryNumber;
    }
  }
  const instagramUrl = /loliburguer/i.test(social.instagram || "")
    ? "https://www.instagram.com/burger.nick_/"
    : social.instagram;
  const threadsUrl = /loliburguer|facebook/i.test(social.facebook || "")
    ? "https://www.threads.com/@burger.nick_?xmt=AQG07ywm8WoDJn94yh7xR0YzUhZHOT_LHABVxYKyFgBzrzw"
    : social.facebook;
  wireSocial("contactIg", instagramUrl);
  wireSocial("contactFb", threadsUrl);
  wireSocial("footerIg", instagramUrl);
  wireSocial("footerFb", threadsUrl);
  wireLink("footerWa", waUrl);
  wireLink("waFloat", waUrl);

  const extra = document.getElementById("footerExtraSocial");
  if (extra) {
    const links = [];
    if (social.tiktok) {
      links.push(
        `<a href="${escapeHtml(social.tiktok)}" target="_blank" rel="noopener noreferrer" aria-label="TikTok">TT</a>`
      );
    }
    if (social.twitter) {
      links.push(
        `<a href="${escapeHtml(social.twitter)}" target="_blank" rel="noopener noreferrer" aria-label="X">X</a>`
      );
    }
    if (social.youtube) {
      links.push(
        `<a href="${escapeHtml(social.youtube)}" target="_blank" rel="noopener noreferrer" aria-label="YouTube">YT</a>`
      );
    }
    extra.innerHTML = links.join("");
  }

  initContactMap(storeCfg);
}

function updateAboutImage(products) {
  const el = document.getElementById("aboutImage");
  if (!el) return;
  const withImg = products.find((p) => p.imageUrl && !p.imageUrl.includes("loliiii"));
  if (withImg?.imageUrl) {
    el.src = withImg.imageUrl;
    el.alt = withImg.name || "Producto Burger Nick";
    el.onerror = () => {
      el.onerror = null;
      el.src = FALLBACK_IMG;
      el.alt = "Burger Nick";
    };
  }
}

function initContactMap(storeCfg) {
  const el = document.getElementById("contactMap");
  if (!el || !window.L) return;
  const lat = storeCfg.lat ?? -27.91125;
  const lng = storeCfg.lng ?? -55.75624;
  const zoom = storeCfg.zoom ?? 14;
  const label = cleanLegacyText(storeCfg.label, "BURGER NICK");

  if (!contactMap) {
    contactMap = L.map(el, { scrollWheelZoom: false }).setView([lat, lng], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(contactMap);
    const icon = L.divIcon({
      className: "",
      html: '<span class="store-marker"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    contactMarker = L.marker([lat, lng], { icon })
      .addTo(contactMap)
      .bindPopup(`<strong>${escapeHtml(label)}</strong>`);
  } else {
    contactMap.setView([lat, lng], zoom);
    contactMarker?.setLatLng([lat, lng]);
  }
}

function renderMenu(filter) {
  const grid = document.getElementById("menuGrid");
  if (!grid) return;
  const items =
    filter === "all"
      ? store.products
      : store.products.filter((p) => p.category === filter);

  if (!items.length) {
    grid.innerHTML = `<div class="empty-menu">
      Todavía no hay productos en esta categoría.<br />
      <a class="btn btn--primary btn--sm" style="margin-top:1rem" href="#contacto">Consultar por WhatsApp</a>
    </div>`;
    return;
  }

  grid.innerHTML = items
    .map((p, i) => {
      const price = productUnitPrice(p);
      const badges = [];
      if (p.isOnSale) badges.push(`<span class="tag tag--oferta">Oferta</span>`);
      if (p.isTrending) badges.push(`<span class="tag tag--tendencia">Más pedida</span>`);
      if (p.isNew) badges.push(`<span class="tag tag--nueva">Nueva</span>`);
      if (p.isPremium) badges.push(`<span class="tag tag--premium">Selección</span>`);

      const priceHtml = p.isOnSale
        ? `<span class="product__price product__price--sale">
            <s class="product__price-old">${formatMoney(p.originalPrice || p.price)}</s>
            <span>${formatMoney(price)}</span>
          </span>`
        : `<span class="product__price">${formatMoney(price)}</span>`;

      return `
      <article class="product" style="animation-delay:${Math.min(i, 8) * 0.04}s" data-category="${escapeHtml(p.category || "")}">
        <div class="product__media">
          ${imgWithFallback(p.imageUrl, p.name)}
          ${badges.length ? `<div class="product__tags">${badges.join("")}</div>` : ""}
        </div>
        <div class="product__body">
          <h3>${escapeHtml(p.name)}</h3>
          <p class="product__desc">${escapeHtml(p.description || "")}</p>
          <p class="product__ingredients"><strong>Ingredientes:</strong> ${escapeHtml(p.ingredients || "Consultar")}</p>
          <div class="product__foot">
            ${priceHtml}
            <button type="button" class="btn btn--primary btn--sm" data-add-cart="${escapeHtml(p.id)}">
              Agregar al carrito
            </button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function renderGallery(products) {
  const grid = document.getElementById("galleryGrid");
  const root = document.getElementById("lightboxRoot");
  if (!grid) return;

  const items = products.filter((p) => p.imageUrl).slice(0, 9);
  if (!items.length) {
    grid.innerHTML = `<div class="empty-menu">La galería se completa con las fotos del menú.</div>`;
    if (root) root.innerHTML = "";
    return;
  }

  grid.innerHTML = items
    .map(
      (p, i) => `
    <a class="gallery__item" href="#gal-${i}" aria-label="Ver ${escapeHtml(p.name)} ampliada">
      ${imgWithFallback(p.imageUrl, p.name)}
    </a>`
    )
    .join("");

  if (root) {
    root.innerHTML = items
      .map(
        (p, i) => `
      <div id="gal-${i}" class="lightbox" role="dialog" aria-modal="true" aria-label="${escapeHtml(p.name)}">
        <a href="#galeria" class="lightbox__close" aria-label="Cerrar imagen">×</a>
        <img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'" />
      </div>`
      )
      .join("");
  }
}

function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      currentFilter = btn.dataset.filter;
      renderMenu(currentFilter);
    });
  });
}

function renderPromos() {
  const grid = document.getElementById("promosGrid");
  if (!grid) return;
  if (!store.promotions.length) {
    grid.innerHTML = `<div class="empty-menu">No hay promociones activas en este momento. Revisá el menú completo.</div>`;
    return;
  }

  grid.innerHTML = store.promotions
    .map((p) => {
      const discountLabel =
        p.discountType === "percent" && p.discountValue
          ? `${p.discountValue}% OFF`
          : p.discountType === "fixed" && p.discountValue
            ? `${formatMoney(p.discountValue)} OFF`
            : "";
      const badge = p.badge || discountLabel;
      return `
      <article class="promo reveal is-visible">
        ${imgWithFallback(p.imageUrl, p.title)}
        <div class="promo__content">
          ${badge ? `<span class="promo__badge">${escapeHtml(badge)}</span>` : ""}
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.description || "")}</p>
          ${p.price != null && p.price !== "" ? `<div class="promo__price">${formatMoney(p.price)}</div>` : ""}
          <a class="btn btn--primary btn--sm promo__cta" href="${escapeHtml(p.link || "#menu")}">${escapeHtml(p.cta || "Ver menú")}</a>
        </div>
      </article>`;
    })
    .join("");
}

function renderFaq() {
  const root = document.getElementById("faqAccordion");
  if (!root) return;
  root.innerHTML = FAQ_ITEMS.map(
    (item, i) => `
    <div class="accordion__item${i === 0 ? " is-open" : ""}">
      <button type="button" class="accordion__btn" id="faq-btn-${i}" aria-expanded="${i === 0}" aria-controls="faq-panel-${i}">
        ${escapeHtml(item.q)}
        <span aria-hidden="true">+</span>
      </button>
      <div class="accordion__panel" id="faq-panel-${i}" role="region" aria-labelledby="faq-btn-${i}">
        <p>${escapeHtml(item.a)}</p>
      </div>
    </div>`
  ).join("");

  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".accordion__btn");
    if (!btn) return;
    const item = btn.closest(".accordion__item");
    const open = item.classList.contains("is-open");
    root.querySelectorAll(".accordion__item").forEach((el) => {
      el.classList.remove("is-open");
      el.querySelector(".accordion__btn")?.setAttribute("aria-expanded", "false");
    });
    if (!open) {
      item.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

function setupHeader() {
  const header = document.getElementById("header");
  const onScroll = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 20);
    highlightNav();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function setupNav() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("nav");
  toggle?.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });
  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle?.classList.remove("is-open");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.setAttribute("aria-label", "Abrir menú");
    });
  });
}

function highlightNav() {
  const sections = ["inicio", "nosotros", "menu", "promociones", "reservas", "galeria", "faq", "contacto"];
  let current = "inicio";
  const offset = window.scrollY + 120;
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.offsetTop <= offset) current = id;
  });
  document.querySelectorAll(".nav__link").forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${current}`);
  });
}

function setupContactForm() {
  const form = document.getElementById("contactForm");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("cName");
    const email = document.getElementById("cEmail");
    const message = document.getElementById("cMessage");
    const note = document.getElementById("contactNote");
    const okName = name.value.trim().length >= 2;
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    const okMsg = message.value.trim().length >= 10;
    [name, email, message].forEach((el) => el.classList.remove("is-invalid"));
    if (!okName) name.classList.add("is-invalid");
    if (!okEmail) email.classList.add("is-invalid");
    if (!okMsg) message.classList.add("is-invalid");
    if (!okName || !okEmail || !okMsg) {
      if (note) {
        note.hidden = false;
        note.textContent = "Revisá los campos del formulario.";
      }
      return;
    }
    const text = encodeURIComponent(
      `Hola Burger Nick.\n\nNombre: ${name.value.trim()}\nEmail: ${email.value.trim()}\n\nMensaje:\n${message.value.trim()}`
    );
    window.open(
      `https://wa.me/${getWhatsAppNumber(store.settings)}?text=${text}`,
      "_blank",
      "noopener"
    );
    if (note) {
      note.hidden = false;
      note.textContent = "Te abrimos WhatsApp para enviar el mensaje.";
    }
    form.reset();
  });
}

function setupReveal() {
  const nodes = document.querySelectorAll(
    ".benefit, .about__media, .about__content, .contact__info, .contact__map-wrap, .reservations__grid, .section__head, .reveal"
  );
  nodes.forEach((el) => el.classList.add("reveal"));
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  nodes.forEach((el) => io.observe(el));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function wireLink(id, href) {
  const el = document.getElementById(id);
  if (el && href) el.href = href;
}

function wireSocial(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  if (href && href !== "#") {
    el.href = href;
    el.hidden = false;
    el.removeAttribute("aria-disabled");
  } else {
    el.hidden = true;
  }
}

function cleanLegacyText(value, fallback) {
  const text = String(value || "").trim();
  return !text || /loli|scaloneta/i.test(text) ? fallback : text;
}

function setupHeroParallax() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const media = document.querySelector(".hero__video");
  if (!media) return;
  let ticking = false;
  const update = () => {
    const offset = Math.min(window.scrollY * 0.08, 45);
    media.style.transform = `scale(1.04) translate3d(0, ${offset}px, 0)`;
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );
}
