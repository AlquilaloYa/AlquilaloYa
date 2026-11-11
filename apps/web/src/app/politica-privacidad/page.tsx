import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad | Alquila Ya",
  description:
    "Conoce qué información trata Alquila Ya, cómo se utiliza y cómo solicitar su eliminación.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: "1. Quién es responsable",
    paragraphs: [
      "Esta política describe el tratamiento de información realizado por Alquila Ya en sus servicios digitales y herramientas de gestión. Para consultas o solicitudes sobre privacidad, escribe a ventas@alquilaya.pe.",
    ],
  },
  {
    title: "2. Información que podemos tratar",
    paragraphs: [
      "Según el servicio que utilices, podemos tratar datos de identificación y contacto; información necesaria para gestionar consultas, alquileres, clientes, contratos, pagos y operaciones; y el contenido de comunicaciones que nos envíes.",
      "Cuando interactúas con nuestros canales de Meta o WhatsApp, podemos recibir el nombre de perfil, número o identificador de la cuenta, mensajes que nos envías, identificadores de mensajes y datos técnicos de entrega o estado. Si conectas servicios como Google Calendar, tratamos los datos necesarios para ofrecer la función que autorizaste.",
      "También se pueden generar datos técnicos de uso y seguridad, como información del navegador, registros de acceso, eventos de la aplicación y preferencias necesarias para que el servicio funcione.",
    ],
  },
  {
    title: "3. Cómo usamos la información",
    paragraphs: [
      "Usamos la información para responder solicitudes, administrar comunicaciones y relaciones con clientes, prestar y mantener las funciones del ERP, gestionar operaciones y contratos, enviar avisos solicitados, proteger las cuentas, prevenir abusos, resolver problemas y cumplir obligaciones legales.",
      "Solo procesamos datos de integraciones externas cuando la integración está habilitada y de acuerdo con los permisos concedidos. No utilizamos los mensajes recibidos para fines ajenos al servicio y a la relación con el usuario.",
    ],
  },
  {
    title: "4. Cookies, almacenamiento y registros",
    paragraphs: [
      "El servicio puede utilizar cookies de sesión para autenticar y proteger el acceso, además de almacenamiento local para recordar preferencias de interfaz. Los registros técnicos se utilizan para seguridad, diagnóstico y continuidad del servicio.",
    ],
  },
  {
    title: "5. Proveedores y comunicaciones",
    paragraphs: [
      "Para prestar el servicio podemos apoyarnos en proveedores de alojamiento, base de datos, autenticación, almacenamiento y comunicaciones, así como en las plataformas que el usuario decida conectar, como Meta/WhatsApp o Google. Estos proveedores procesan información de acuerdo con sus funciones y políticas; la información puede procesarse en los países donde operan.",
      "No vendemos información personal. Podemos comunicarla cuando sea necesario para prestar una función solicitada, cumplir la ley, proteger derechos y seguridad, o responder a una solicitud válida de una autoridad.",
    ],
  },
  {
    title: "6. Conservación y seguridad",
    paragraphs: [
      "Conservamos la información durante el tiempo necesario para los fines descritos, mantener la relación de servicio, atender obligaciones legales y resolver controversias. Aplicamos controles técnicos y organizativos razonables para protegerla; ningún sistema conectado a Internet puede garantizar seguridad absoluta.",
    ],
  },
  {
    title: "7. Acceso, corrección y eliminación",
    paragraphs: [
      "Puedes solicitar acceso, corrección o eliminación de información asociada contigo escribiendo a ventas@alquilaya.pe con el asunto “Privacidad y datos personales”. Indica el canal o servicio relacionado y un medio para responderte. Podremos pedir información razonable para verificar la solicitud y proteger la cuenta.",
      "Al confirmar una solicitud de eliminación, eliminaremos o desasociaremos la información que ya no sea necesaria, sujeto a obligaciones legales, seguridad, copias de respaldo y registros que debamos conservar. Para datos recibidos mediante Meta o WhatsApp, incluye tu número con código de país y el identificador de la cuenta o conversación si lo conoces.",
    ],
  },
  {
    title: "8. Privacidad de menores",
    paragraphs: [
      "Estos servicios no están dirigidos a menores de edad y no buscamos recopilar intencionalmente sus datos. Si crees que un menor nos proporcionó información, contáctanos para revisarla.",
    ],
  },
  {
    title: "9. Cambios y contacto",
    paragraphs: [
      "Podemos actualizar esta política cuando cambien nuestros servicios o prácticas. Publicaremos aquí la versión vigente y su fecha de actualización. Para cualquier consulta de privacidad, escribe a ventas@alquilaya.pe.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-surface px-5 py-12 text-on-surface sm:px-8">
      <article className="mx-auto max-w-3xl">
        <a
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Alquila Ya
        </a>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
          Política de privacidad
        </h1>
        <p className="mt-3 text-sm text-on-surface-variant">
          Última actualización: 11 de noviembre de 2026
        </p>
        <p className="mt-6 leading-7 text-on-surface-variant">
          Esta política explica qué información podemos recopilar o recibir,
          cómo la utilizamos y cómo puedes solicitar su eliminación cuando
          interactúas con Alquila Ya, incluido el uso de canales y servicios de
          terceros.
        </p>
        <p className="mt-3 text-sm text-on-surface-variant">
          Contacto:{" "}
          <a
            href="mailto:ventas@alquilaya.pe?subject=Privacidad%20y%20datos%20personales"
            className="text-primary underline underline-offset-4"
          >
            ventas@alquilaya.pe
          </a>
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 leading-7 text-on-surface-variant">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
