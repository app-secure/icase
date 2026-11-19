const path = require('path');
let mockParsedDates;
jest.mock('pdf-parse', () => ({ PDFParse: class {
  async getInfo() { return { getDateNode: () => mockParsedDates }; }
  async destroy() {}
} }));
const FileIngestionService = require('../src/infrastructure/services/FileIngestionService');

describe('detección de fecha documental', () => {
  const service = new FileIngestionService();
  const readableFile = path.join(__dirname, '../src/infrastructure/services/FileIngestionService.js');
  test('prioriza fecha de creación del PDF y devuelve formato ISO corto', async () => {
    mockParsedDates = { CreationDate: new Date('2024-03-12T18:30:00.000Z'), ModDate: new Date('2025-01-01T00:00:00Z') };
    await expect(service.extraerFechaDocumento(readableFile, 'pdf')).resolves.toBe('2024-03-12');
  });
  test('deja vacía la fecha cuando el archivo no es PDF o no tiene fecha confiable', async () => {
    mockParsedDates = { CreationDate: null, ModDate: null };
    await expect(service.extraerFechaDocumento(readableFile, 'texto')).resolves.toBe('');
    await expect(service.extraerFechaDocumento(readableFile, 'pdf')).resolves.toBe('');
  });
});
