import type { ContactSeed } from "@/lib/contactos-seed";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderChecklistHtml(
  templateHtml: string,
  contact: Pick<ContactSeed, "nombre" | "apellido" | "dni" | "ruc" | "domicilio" | "email" | "telefono">,
  selectedItems: string[]
): string {
  const values: Record<string, string> = {
    "{{CONTACTO_NOMBRE}}": contact.nombre,
    "{{CONTACTO_APELLIDO}}": contact.apellido,
    "{{CONTACTO_NOMBRE_COMPLETO}}": [contact.nombre, contact.apellido].filter(Boolean).join(" "),
    "{{CONTACTO_DOCUMENTO}}": contact.dni,
    "{{CONTACTO_RUC}}": contact.ruc ?? "",
    "{{CONTACTO_DOMICILIO}}": contact.domicilio ?? "",
    "{{CONTACTO_EMAIL}}": contact.email,
    "{{CONTACTO_TELEFONO}}": contact.telefono,
    "{{CHECKLIST_ITEMS}}": selectedItems.map((item) => `<li>${escapeHtml(item)}</li>`).join(""),
  };
  let html = templateHtml;
  for (const [token, value] of Object.entries(values)) {
    html = html.split(token).join(token === "{{CHECKLIST_ITEMS}}" ? value : escapeHtml(value));
  }
  return html;
}