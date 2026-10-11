import { deflateRaw } from "pako";

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * Sanitizador de sintaxis para PlantUML y Structurizr C4.
 * Resuelve errores de sintaxis causados por comillas dobles anidadas dentro de títulos o nombres
 * (ejemplo: rectangle "Sistema "El Fogón"" o System_Boundary(c1, "Sistema "El Fogón"")).
 */
export function sanitizePlantUML(code) {
  if (!code || typeof code !== "string") return "";

  let normalized = decodeHtmlEntities(code)
    .replace(/\\([<>])/g, "$1")
    .replace(/\\\r?\n/g, "\n");

  // Algunos proveedores duplican el escape JSON y devuelven todo el diagrama
  // en una sola línea con secuencias literales "\\n".
  if (/^\s*@start(?:uml|wbs|mindmap)\\n/i.test(normalized)) {
    normalized = normalized.replace(/\\n/g, "\n").replace(/\\t/g, "  ");
  }

  const lines = normalized
    .split("\n")
    .map((line) => {
      let l = line;
      const trimmed = l.trim();
      if (!trimmed) return l;

      // 1. Corregir comillas dobles consecutivas al final de cadenas: ej. "" { o "") {
      l = l.replace(/""\s*(\)|{|as\s|\n|$)/g, `"' $1`);

      // 2. Directiva rectangle "..." { (muy común en Casos de Uso con el nombre del sistema entre comillas)
      l = l.replace(/^(\s*rectangle\s+)"(.*)"(\s*(\{.*)?)$/i, (m, p1, inner, p2) => {
        return `${p1}"${inner.replace(/["“”]/g, "'")}"${p2 || ""}`;
      });

      // 3. Directiva package / node / usecase / actor "..."
      l = l.replace(/^(\s*(package|node|usecase|actor)\s+)"(.*)"(\s*(as\s.*|\{.*)?)$/i, (m, p1, p2, inner, p3) => {
        return `${p1}"${inner.replace(/["“”]/g, "'")}"${p3 || ""}`;
      });

      // 4. Funciones C4: System_Boundary(id, "label") {
      l = l.replace(/^(\s*System_Boundary\s*\(\s*[^,]+,\s*)"(.*)"(\s*\)\s*(\{.*)?)$/i, (m, p1, inner, p2) => {
        return `${p1}"${inner.replace(/["“”]/g, "'")}"${p2 || ""}`;
      });

      // 5. Directivas de título (evitar comillas dobles que rompen PlantUML)
      if (trimmed.toLowerCase().startsWith("title ")) {
        return l.replace(/["“”]/g, "'");
      }

      // 6. Directivas de árbol jerárquico (* Sistema "Nombre")
      if (trimmed.startsWith("*")) {
        return l.replace(/["“”]/g, "'");
      }

      // 7. General C4 macros: Person, System, Container, ContainerDb, Rel
      if (/^(Person|System|Container|ContainerDb|Rel)\s*\(/.test(trimmed)) {
        l = l.replace(/[“”]/g, "'");
      }

      return l;
    });

  // PlantUML no admite continuar una nota de una sola línea en la línea
  // siguiente. Algunos modelos separan "Origen:"; se integra en la nota.
  return lines.reduce((result, line) => {
    if (/^\s*(?:Origen|Trazabilidad)\s*:/i.test(line) && /^\s*note\s+.+\s*:/i.test(result.at(-1) || "")) {
      result[result.length - 1] += `\\n${line.trim()}`;
    } else {
      result.push(line);
    }
    return result;
  }, []).join("\n");
}

/**
 * Codificador comprimido oficial de PlantUML (DEFLATE raw + alfabeto propio).
 * A diferencia de HEX (~h), mantiene cortas las URL de diagramas grandes.
 */
function encode6bit(value) {
  if (value < 10) return String.fromCharCode(48 + value);
  if (value < 36) return String.fromCharCode(65 + value - 10);
  if (value < 62) return String.fromCharCode(97 + value - 36);
  return value === 62 ? "-" : "_";
}

function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x03) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0x0f) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function encode64(data) {
  let result = "";
  for (let index = 0; index < data.length; index += 3) {
    const remaining = data.length - index;
    if (remaining === 1) {
      result += append3bytes(data[index], 0, 0).slice(0, 2);
    } else if (remaining === 2) {
      result += append3bytes(data[index], data[index + 1], 0).slice(0, 3);
    } else {
      result += append3bytes(data[index], data[index + 1], data[index + 2]);
    }
  }
  return result;
}

export function encodePlantUML(text) {
  if (!text || !text.trim()) return "";
  const sanitized = sanitizePlantUML(text.trim());
  const utf8Bytes = new TextEncoder().encode(sanitized);
  return encode64(deflateRaw(utf8Bytes, { level: 9 }));
}

/**
 * Retorna la URL del servidor SVG de PlantUML.
 * @param {string} text - Código PlantUML
 * @returns {string} URL completa al archivo SVG renderizado
 */
export function getPlantUMLSvgUrl(text) {
  const encoded = encodePlantUML(text);
  if (!encoded) return "";
  return `https://www.plantuml.com/plantuml/svg/${encoded}`;
}

/**
 * Retorna la URL del servidor PNG de PlantUML (ideal para incrustación directa en PDF con jsPDF).
 * @param {string} text - Código PlantUML
 * @returns {string} URL completa a la imagen PNG renderizada
 */
export function getPlantUMLPngUrl(text) {
  const encoded = encodePlantUML(text);
  if (!encoded) return "";
  return `https://www.plantuml.com/plantuml/png/${encoded}`;
}
