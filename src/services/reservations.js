import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { normalizePhone } from "../utils/format.js";

const reservationsCollection = collection(db, "reservations");

export const RESERVATION_STATUSES = [
  "pendiente",
  "confirmada",
  "completada",
  "cancelada",
];

function normalizeReservation(data) {
  const guests = Number(data.guests || 0);
  const phone = normalizePhone(data.phone);
  const date = String(data.date || "").trim();
  const time = String(data.time || "").trim();
  const name = String(data.name || "").trim();
  const notes = String(data.notes || "").trim();

  if (name.length < 2 || name.length > 100) {
    throw new Error("Ingresá un nombre válido.");
  }
  if (!/^\d{8,15}$/.test(phone)) {
    throw new Error("Ingresá un WhatsApp válido.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Elegí una fecha válida.");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Elegí un horario válido.");
  }
  const reservationDate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(reservationDate.getTime()) || reservationDate.getTime() < Date.now()) {
    throw new Error("La reserva debe ser para una fecha futura.");
  }
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
    throw new Error("La cantidad de personas debe estar entre 1 y 20.");
  }
  if (notes.length > 500) {
    throw new Error("Las observaciones no pueden superar 500 caracteres.");
  }

  return { name, phone, date, time, guests, notes };
}

export async function createReservation(data) {
  const payload = normalizeReservation(data);
  const reference = await addDoc(reservationsCollection, {
    ...payload,
    status: "pendiente",
    source: "web",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export function listenReservations(callback, onError) {
  let activeUnsubscribe = () => {};

  const attach = (fallback) => {
    const target = fallback
      ? reservationsCollection
      : query(reservationsCollection, orderBy("createdAt", "desc"));
    activeUnsubscribe = onSnapshot(
      target,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (fallback) {
          items.sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
          );
        }
        callback(items);
      },
      (error) => {
        if (!fallback && error?.code === "failed-precondition") {
          activeUnsubscribe();
          attach(true);
          return;
        }
        onError?.(error);
      }
    );
  };

  attach(false);
  return () => activeUnsubscribe();
}

export async function updateReservation(id, data) {
  const payload = { ...data };
  if (payload.status && !RESERVATION_STATUSES.includes(payload.status)) {
    throw new Error("Estado de reserva inválido.");
  }
  if (
    ["name", "phone", "date", "time", "guests", "notes"].some((field) =>
      Object.hasOwn(payload, field)
    )
  ) {
    Object.assign(payload, normalizeReservation(payload));
  }
  await updateDoc(doc(db, "reservations", id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export function updateReservationStatus(id, status) {
  return updateReservation(id, { status });
}

export async function deleteReservation(id) {
  await deleteDoc(doc(db, "reservations", id));
}
