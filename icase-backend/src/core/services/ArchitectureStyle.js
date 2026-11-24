/**
 * Estilo con el que se dibuja el backend en la arquitectura de software. Si el insumo o el análisis recomiendan uno (MVC, limpia o
 * hexagonal, por capas), el diagrama lo usa; si no, describe la organización real del backend generado. Solo orienta el diagrama:
 * el código que se genera no depende de esta elección.
 */
const strip = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const STYLES = [
  { id: 'limpia', etiqueta: 'arquitectura limpia (hexagonal)', patron: /clean architecture|arquitectura limpia|arquitectura hexagonal|\bhexagonal\b|puertos y adaptadores|\bddd\b/,
    directriz: 'Dentro del contenedor del backend dibuja componentes por anillos: Dominio (entidades y reglas), Casos de uso (un componente por función principal agrupada), Adaptadores de entrada (controladores y rutas HTTP) y de salida (persistencia, seguridad). Las dependencias apuntan hacia el dominio.' },
  { id: 'mvc', etiqueta: 'MVC (modelo, vista, controlador)', patron: /\bmvc\b|modelo[- ]vista[- ]controlador/,
    directriz: 'Dentro del contenedor del backend dibuja Controladores (rutas y manejo de peticiones), Modelos (entidades, reglas y acceso a datos) y, en la interfaz web, las Vistas. El controlador coordina; el modelo no conoce la vista.' },
  { id: 'capas', etiqueta: 'arquitectura por capas', patron: /arquitectura (?:en|por) capas|n[- ]capas|layered|tres capas|3 capas/,
    directriz: 'Dentro del contenedor del backend dibuja capas: Presentación (API REST), Negocio (servicios y reglas) y Datos (persistencia). Cada capa solo usa la inmediatamente inferior.' }
];

const DEFAULT = {
  id: 'modular', etiqueta: 'API REST modular sobre una capa de datos común', origen: 'backend generado',
  directriz: 'Dentro del contenedor del backend dibuja: Módulos por función (rutas y reglas de cada grupo funcional), Capa de datos común (almacén de registros, reglas de negocio y cálculos), Seguridad y autenticación (JWT, roles) y Documentación de la API. No crees un contenedor separado por requisito.'
};

function detect(texts = []) {
  const text = strip((Array.isArray(texts) ? texts : [texts]).map((item) => (typeof item === 'string' ? item : JSON.stringify(item || ''))).join(' '));
  const found = STYLES.find((style) => style.patron.test(text));
  return found ? { id: found.id, etiqueta: found.etiqueta, origen: 'recomendación del insumo', directriz: found.directriz } : DEFAULT;
}

/** Texto para el prompt de la arquitectura de software. */
function instruction(texts) {
  const style = detect(texts);
  return `\n\nESTILO ARQUITECTÓNICO DEL BACKEND: ${style.etiqueta} (${style.origen}). ${style.directriz} Usa solo este estilo para organizar el backend; no cambia el stack ni el resto de los contenedores.`;
}

module.exports = { detect, instruction };
