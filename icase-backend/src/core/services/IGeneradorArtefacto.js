class IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) { // eslint-disable-line no-unused-vars
    throw new Error('El generador debe implementar generar({ proyecto, insumos, versionesOrigen }).');
  }
}

module.exports = IGeneradorArtefacto;
