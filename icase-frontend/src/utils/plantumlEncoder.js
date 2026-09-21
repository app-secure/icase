/**
 * Sanitizador de sintaxis para PlantUML y Structurizr C4.
 * Resuelve errores de sintaxis causados por comillas dobles anidadas dentro de títulos o nombres
 * (ejemplo: rectangle "Sistema "El Fogón"" o System_Boundary(c1, "Sistema "El Fogón"")).
 */
export function sanitizePlantUML(code) {
  if (!code || typeof code !== "string") return "";

  return code
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

      // 6. Directivas WBS jerárquicas (* Sistema "Nombre")
      if (trimmed.startsWith("*")) {
        return l.replace(/["“”]/g, "'");
      }

      // 7. General C4 macros: Person, System, Container, ContainerDb, Rel
      if (/^(Person|System|Container|ContainerDb|Rel)\s*\(/.test(trimmed)) {
        l = l.replace(/[“”]/g, "'");
      }

      return l;
    })
    .join("\n");
}

/**
 * Codificador oficial de PlantUML mediante formato HEX (~h).
 * Es el estándar soportado nativamente por el servidor de PlantUML, 100% gratuito y sin tokens.
 * Evita desalineaciones de compresión Huffman que causaban error en el navegador.
 */
export function encodePlantUML(text) {
  if (!text || !text.trim()) return "";
  const sanitized = sanitizePlantUML(text.trim());
  const utf8Bytes = new TextEncoder().encode(sanitized);
  let hex = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    hex += utf8Bytes[i].toString(16).padStart(2, "0");
  }
  return "~h" + hex;
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
