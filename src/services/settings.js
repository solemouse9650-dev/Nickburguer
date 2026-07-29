import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";

export const DEFAULT_SETTINGS = {
  business: {
    name: "Burger Nick",
    slogan: "Since 2024",
    description:
      "Burger Nick nació para transformar una hamburguesa en una experiencia: ingredientes seleccionados, cocina al momento y sabor sin atajos.",
    address: "Juan José Lanusse 647",
    city: "Apóstoles",
    province: "Misiones",
    postalCode: "3350",
  },
  contact: {
    whatsapp: "3765130819",
    whatsappPrimary: "3765130819",
    whatsappSecondary: "3758460155",
    whatsappCountryCode: "54",
    email: "",
    phoneLandline: "",
    phoneMobile: "3765130819",
  },
  hours: {
    lunes: { closed: true, open: "", close: "" },
    martes: { closed: false, open: "19:00", close: "00:00" },
    miercoles: { closed: false, open: "19:00", close: "00:00" },
    jueves: { closed: false, open: "19:00", close: "00:00" },
    viernes: { closed: false, open: "19:00", close: "00:00" },
    sabado: { closed: false, open: "19:00", close: "00:00" },
    domingo: { closed: false, open: "19:00", close: "00:00" },
  },
  social: {
    instagram: "https://www.instagram.com/burger.nick_/",
    threads: "https://www.threads.com/@burger.nick_?xmt=AQG07ywm8WoDJn94yh7xR0YzUhZHOT_LHABVxYKyFgBzrzw",
    tiktok: "",
    twitter: "",
    youtube: "",
  },
  shipping: {
    freeShippingEnabled: false,
    freeShippingMin: 25000,
    standardCost: 3000,
    baseCost: 3000,
    costPerKm: 3000,
    maxRadiusKm: 15,
    minOrderAmount: 0,
    estimatedMinutes: 40,
    zoneCosts: [],
  },
  payment: {
    alias: "",
    cbu: "",
    holder: "BURGER NICK",
  },
  store: {
    lat: -27.91125,
    lng: -55.75624,
    label: "BURGER NICK",
    zoom: 16,
    mapsUrl: "",
  },
  messages: {
    received: "Tu pedido fue recibido correctamente.",
    confirmed: "Tu pedido fue confirmado.",
    preparing: "Estamos preparando tu pedido.",
    ready: "Tu pedido está listo.",
    onTheWay: "Tu pedido va en camino.",
    delivered: "Tu pedido fue entregado.",
    cancelled: "Tu pedido fue cancelado.",
  },
  branding: {
    logoUrl: "/burger-nick-logo.png",
    faviconUrl: "/burger-nick-logo.png",
    coverUrl: "",
    heroUrl: "",
    primaryColor: "#d8c6a5",
    secondaryColor: "#f2e8d8",
  },
  about: {
    mission: "Servir sabor memorable, con calidad constante y atención cercana.",
    vision: "Ser la hamburguesería de referencia de la zona, pedido tras pedido.",
    quality: "Ingredientes frescos, cocina al momento y cero compromiso con el sabor.",
  },
  customers: {
    vipMinSpent: 50000,
    vipMinOrders: 5,
    recurrentMinOrders: 2,
  },
};

const settingsRef = doc(db, "business_settings", "main");

export function listenSettings(callback, onError) {
  return onSnapshot(
    settingsRef,
    (snap) => {
      if (!snap.exists()) {
        callback({ ...DEFAULT_SETTINGS });
        return;
      }
      callback(mergeSettings(DEFAULT_SETTINGS, snap.data()));
    },
    onError
  );
}

export async function saveSettings(data) {
  await setDoc(
    settingsRef,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function mergeSettings(defaults, incoming) {
  const out = structuredClone(defaults);
  Object.keys(incoming || {}).forEach((key) => {
    if (
      incoming[key] &&
      typeof incoming[key] === "object" &&
      !Array.isArray(incoming[key]) &&
      !(incoming[key]?.toDate)
    ) {
      out[key] = { ...(out[key] || {}), ...incoming[key] };
      // No pisar alias/CBU/titular con strings vacíos del panel
      if (key === "payment") {
        const d = defaults.payment || {};
        ["alias", "cbu", "holder"].forEach((field) => {
          if (!String(out.payment?.[field] || "").trim()) {
            out.payment[field] = d[field] || "";
          }
        });
      }
    } else {
      out[key] = incoming[key];
    }
  });
  if (!incoming?.social?.threads && incoming?.social?.facebook) {
    out.social.threads = incoming.social.facebook;
  }
  return out;
}

export function formatHoursText(hours) {
  if (!hours) return "";
  const labels = {
    lunes: "Lunes",
    martes: "Martes",
    miercoles: "Miércoles",
    jueves: "Jueves",
    viernes: "Viernes",
    sabado: "Sábado",
    domingo: "Domingo",
  };
  return Object.entries(labels)
    .map(([key, label]) => {
      const h = hours[key];
      if (!h || h.closed) return `${label}: Cerrado`;
      return `${label}: ${h.open} – ${h.close}`;
    })
    .join(" · ");
}
