import {
  RESERVATION_STATUSES,
  createReservation,
  deleteReservation,
  listenReservations,
  updateReservation,
  updateReservationStatus,
} from "../../services/reservations.js";
import { escapeHtml, formatDate } from "../../utils/format.js";
import { confirmDialog, showErrorToast, showToast } from "../../utils/toast.js";

let unsubscribe = null;
let clickController = null;
let reservations = [];
let editing = null;

const STATUS_LABELS = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
};

export function mountReservations(root) {
  unmountReservations();
  root.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <div>
          <h2>Reservas</h2>
          <p class="muted">Gestioná solicitudes y confirmaciones en tiempo real.</p>
        </div>
        <button type="button" class="btn btn-primary" id="newReservation">Nueva reserva</button>
      </div>
      <div class="toolbar">
        <input type="search" id="reservationSearch" placeholder="Buscar nombre, teléfono o fecha..." />
        <select id="reservationStatus">
          <option value="todas">Todos los estados</option>
          ${RESERVATION_STATUSES.map(
            (status) => `<option value="${status}">${STATUS_LABELS[status]}</option>`
          ).join("")}
        </select>
      </div>
      <div class="table-wrap" id="reservationsTable"><div class="skeleton"></div></div>
    </section>
    <div id="reservationFormHost"></div>
  `;

  clickController = new AbortController();
  const { signal } = clickController;
  root.querySelector("#newReservation").addEventListener("click", () => openForm(root), {
    signal,
  });
  root.querySelector("#reservationSearch").addEventListener("input", () => render(root), {
    signal,
  });
  root.querySelector("#reservationStatus").addEventListener("change", () => render(root), {
    signal,
  });
  root.querySelector("#reservationsTable").addEventListener(
    "click",
    async (event) => {
      const editButton = event.target.closest("[data-edit-reservation]");
      const deleteButton = event.target.closest("[data-delete-reservation]");
      const whatsappButton = event.target.closest("[data-whatsapp-reservation]");
      if (editButton) {
        openForm(
          root,
          reservations.find((item) => item.id === editButton.dataset.editReservation)
        );
      }
      if (whatsappButton) {
        const reservation = reservations.find(
          (item) => item.id === whatsappButton.dataset.whatsappReservation
        );
        if (reservation) {
          const message = encodeURIComponent(
            `Hola ${reservation.name}, te contactamos de Burger Nick por tu reserva del ${reservation.date} a las ${reservation.time} para ${reservation.guests} personas.`
          );
          window.open(`https://wa.me/54${reservation.phone}?text=${message}`, "_blank", "noopener");
        }
      }
      if (deleteButton) {
        if (!confirmDialog("¿Eliminar definitivamente esta reserva?")) return;
        try {
          await deleteReservation(deleteButton.dataset.deleteReservation);
          showToast("Reserva eliminada", "success");
        } catch (error) {
          showErrorToast(error, "No se pudo eliminar la reserva");
        }
      }
    },
    { signal }
  );
  root.querySelector("#reservationsTable").addEventListener(
    "change",
    async (event) => {
      const select = event.target.closest("[data-reservation-status]");
      if (!select) return;
      select.disabled = true;
      try {
        await updateReservationStatus(select.dataset.reservationStatus, select.value);
        showToast("Estado actualizado", "success");
      } catch (error) {
        showErrorToast(error, "No se pudo actualizar");
      } finally {
        select.disabled = false;
      }
    },
    { signal }
  );

  unsubscribe = listenReservations(
    (items) => {
      reservations = items;
      render(root);
    },
    (error) => {
      showErrorToast(error, "No se pudieron cargar las reservas");
      root.querySelector("#reservationsTable").innerHTML =
        '<div class="empty">No se pudieron cargar las reservas.</div>';
    }
  );
}

export function unmountReservations() {
  unsubscribe?.();
  unsubscribe = null;
  clickController?.abort();
  clickController = null;
  reservations = [];
  editing = null;
}

function render(root) {
  const host = root.querySelector("#reservationsTable");
  if (!host) return;
  const search = String(root.querySelector("#reservationSearch")?.value || "")
    .trim()
    .toLowerCase();
  const status = root.querySelector("#reservationStatus")?.value || "todas";
  const filtered = reservations.filter((reservation) => {
    if (status !== "todas" && reservation.status !== status) return false;
    if (!search) return true;
    return `${reservation.name} ${reservation.phone} ${reservation.date}`
      .toLowerCase()
      .includes(search);
  });

  if (!filtered.length) {
    host.innerHTML = '<div class="empty">No hay reservas que coincidan con los filtros.</div>';
    return;
  }

  host.innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Personas</th><th>Estado</th><th>Creada</th><th>Acciones</th></tr></thead>
      <tbody>${filtered
        .map(
          (reservation) => `
          <tr>
            <td><strong>${escapeHtml(reservation.date || "—")}</strong><br><span class="muted">${escapeHtml(reservation.time || "")}</span></td>
            <td>${escapeHtml(reservation.name || "—")}<br><span class="muted">${escapeHtml(reservation.phone || "")}</span></td>
            <td>${Number(reservation.guests || 0)}</td>
            <td>
              <select data-reservation-status="${reservation.id}" aria-label="Estado de ${escapeHtml(reservation.name || "reserva")}">
                ${RESERVATION_STATUSES.map(
                  (item) =>
                    `<option value="${item}" ${reservation.status === item ? "selected" : ""}>${STATUS_LABELS[item]}</option>`
                ).join("")}
              </select>
            </td>
            <td>${formatDate(reservation.createdAt)}</td>
            <td class="actions">
              <button class="btn btn-sm btn-ghost" data-whatsapp-reservation="${reservation.id}">WhatsApp</button>
              <button class="btn btn-sm btn-ghost" data-edit-reservation="${reservation.id}">Editar</button>
              <button class="btn btn-sm btn-danger" data-delete-reservation="${reservation.id}">Eliminar</button>
            </td>
          </tr>`
        )
        .join("")}</tbody>
    </table>
  `;
}

function openForm(root, reservation = null) {
  editing = reservation || null;
  const host = root.querySelector("#reservationFormHost");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  host.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <h2>${editing ? "Editar reserva" : "Nueva reserva"}</h2>
        <button type="button" class="btn btn-ghost" id="cancelReservation">Cancelar</button>
      </div>
      <form id="reservationAdminForm" class="form-grid">
        <div class="field"><label>Nombre *</label><input name="name" required maxlength="100" value="${escapeHtml(editing?.name || "")}" /></div>
        <div class="field"><label>WhatsApp *</label><input name="phone" required inputmode="tel" value="${escapeHtml(editing?.phone || "")}" /></div>
        <div class="field"><label>Fecha *</label><input name="date" type="date" required min="${tomorrow}" value="${escapeHtml(editing?.date || tomorrow)}" /></div>
        <div class="field"><label>Horario *</label><input name="time" type="time" required value="${escapeHtml(editing?.time || "21:00")}" /></div>
        <div class="field"><label>Personas *</label><input name="guests" type="number" required min="1" max="20" value="${Number(editing?.guests || 2)}" /></div>
        <div class="field">
          <label>Estado</label>
          <select name="status">${RESERVATION_STATUSES.map(
            (status) =>
              `<option value="${status}" ${editing?.status === status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`
          ).join("")}</select>
        </div>
        <div class="field full"><label>Observaciones</label><textarea name="notes" rows="3" maxlength="500">${escapeHtml(editing?.notes || "")}</textarea></div>
        <div class="field full"><button type="submit" class="btn btn-primary">Guardar reserva</button></div>
      </form>
    </section>
  `;

  host.querySelector("#cancelReservation").onclick = () => {
    host.innerHTML = "";
    editing = null;
  };
  host.querySelector("#reservationAdminForm").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const payload = {
      name: form.name.value,
      phone: form.phone.value,
      date: form.date.value,
      time: form.time.value,
      guests: form.guests.value,
      notes: form.notes.value,
      status: form.status.value,
    };
    button.disabled = true;
    try {
      if (editing) {
        await updateReservation(editing.id, payload);
      } else {
        const id = await createReservation(payload);
        if (payload.status !== "pendiente") {
          await updateReservationStatus(id, payload.status);
        }
      }
      showToast("Reserva guardada", "success");
      host.innerHTML = "";
      editing = null;
    } catch (error) {
      showErrorToast(error, "No se pudo guardar la reserva");
    } finally {
      button.disabled = false;
    }
  };
}
