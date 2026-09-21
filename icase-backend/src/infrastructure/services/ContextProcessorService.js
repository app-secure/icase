class ContextProcessorService {
  procesarTexto(contenido, nombreArchivo = '') {
    if (!contenido) return '';

    // Si es un buffer o string, normalizar
    let texto = typeof contenido === 'string' ? contenido : contenido.toString('utf8');

    // Limpieza de caracteres de control
    texto = texto.replace(/\r\n/g, '\n').replace(/\t/g, '  ').trim();

    return texto;
  }
}

module.exports = ContextProcessorService;
