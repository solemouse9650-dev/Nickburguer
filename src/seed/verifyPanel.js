import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

async function main() {
  const email = String(process.env.VITE_ADMIN_EMAIL || "").trim();
  const password = process.env.SEED_PASSWORD || "";
  const expectedUid = String(process.env.VITE_ADMIN_UID || "").trim();
  if (!email || !password || !expectedUid) {
    throw new Error("Faltan VITE_ADMIN_EMAIL, VITE_ADMIN_UID o SEED_PASSWORD.");
  }

  const app = initializeApp(firebaseConfig, `panel-check-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (credential.user.uid !== expectedUid) {
    throw new Error("El UID autenticado no coincide con VITE_ADMIN_UID.");
  }

  const profile = await getDoc(doc(db, "users", expectedUid));
  if (!profile.exists() || profile.data().role !== "admin") {
    throw new Error("El perfil administrador no existe o no tiene role=admin.");
  }

  const collectionNames = [
    "products",
    "categories",
    "promotions",
    "coupons",
    "customers",
    "orders",
    "reservations",
  ];
  const counts = {};
  for (const name of collectionNames) {
    counts[name] = (await getCountFromServer(collection(db, name))).data().count;
  }

  const settings = await getDoc(doc(db, "business_settings", "main"));
  const counter = await getDoc(doc(db, "counters", "orders"));
  if (!settings.exists()) throw new Error("Falta business_settings/main.");
  if (counter.exists() && !Number.isFinite(Number(counter.data().value))) {
    throw new Error("El contador histórico de pedidos es inválido.");
  }

  const checkRef = doc(db, "products", "panel-healthcheck-temporary");
  const reservationCheckRef = doc(
    db,
    "reservations",
    "panel-healthcheck-reservation-temporary"
  );
  try {
    await setDoc(checkRef, {
      name: "Panel healthcheck",
      category: "otros",
      price: 0,
      available: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(checkRef, {
      name: "Panel healthcheck actualizado",
      updatedAt: serverTimestamp(),
    });
    const check = await getDoc(checkRef);
    if (!check.exists() || check.data().name !== "Panel healthcheck actualizado") {
      throw new Error("La prueba CRUD de productos no pudo verificarse.");
    }
    await setDoc(reservationCheckRef, {
      name: "Reserva healthcheck",
      phone: "3760000099",
      date: "2099-12-31",
      time: "21:00",
      guests: 2,
      notes: "",
      status: "pendiente",
      source: "healthcheck",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(reservationCheckRef, {
      status: "confirmada",
      updatedAt: serverTimestamp(),
    });
    const reservationCheck = await getDoc(reservationCheckRef);
    if (
      !reservationCheck.exists()
      || reservationCheck.data().status !== "confirmada"
    ) {
      throw new Error("La prueba CRUD de reservas no pudo verificarse.");
    }
  } finally {
    await deleteDoc(checkRef).catch(() => {});
    await deleteDoc(reservationCheckRef).catch(() => {});
  }

  await signOut(auth);
  console.log(
    JSON.stringify({
      ok: true,
      projectId: firebaseConfig.projectId,
      adminUid: expectedUid,
      counts,
      counter: counter.exists() ? Number(counter.data().value || 0) : null,
      crud: "create/update/read/delete OK",
    })
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(`Panel check falló: ${error?.message || error}`);
  process.exit(1);
});
