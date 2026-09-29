const axios = require('axios');

class MockupImageService {
  constructor() {
    this.enabled = process.env.MOCKUP_IMAGES_ENABLED === 'true';
    this.cfAccountId = process.env.CF_ACCOUNT_ID || '';
    this.cfApiToken = process.env.CF_API_TOKEN || '';
    this.model = '@cf/black-forest-labs/flux-1-schnell';
  }

  async generarImagen({ prompt, width = 1024, height = 1024 }) {
    if (!this.enabled) {
      return null;
    }

    if (!this.cfAccountId || !this.cfApiToken) {
      console.warn('[MockupImageService] CF_ACCOUNT_ID o CF_API_TOKEN no configurados. Imágenes deshabilitadas.');
      return { url: null, base64: null, proveedor: 'cloudflare', advertencia: 'Credenciales Cloudflare faltantes' };
    }

    try {
      console.log('[MockupImageService] Generando imagen con Cloudflare Workers AI (Flux Schnell)...');
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.cfAccountId}/ai/run/${this.model}`;

      const res = await axios.post(
        url,
        {
          prompt,
          steps: 4,
          width,
          height
        },
        {
          headers: {
            'Authorization': `Bearer ${this.cfApiToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000,
          responseType: 'arraybuffer'
        }
      );

      if (res.data && res.data.length > 0) {
        const base64 = Buffer.from(res.data).toString('base64');
        const mimeType = 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        console.log('[MockupImageService] Imagen generada exitosamente');
        return {
          url: dataUrl,
          base64,
          proveedor: 'cloudflare'
        };
      }
    } catch (err) {
      console.warn('[MockupImageService] Error generando imagen:', err.response?.data?.error?.message || err.message);
    }

    return { url: null, base64: null, proveedor: 'cloudflare', advertencia: 'Falló generación de imagen' };
  }
}

module.exports = MockupImageService;