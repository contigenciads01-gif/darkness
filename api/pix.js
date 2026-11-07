const { createPixTransaction } = require('../lib/invictus');

module.exports = async function handler(req, res) {
  // Configuração de cabeçalhos de resposta
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Corpo da requisição inválido (JSON malformatado).' });
      }
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Corpo da requisição não informado.' });
    }

    const { variantId, customer } = body;

    // Constrói postbackUrl apenas se for HTTPS válido
    const baseUrl = process.env.PUBLIC_BASE_URL;
    let postbackUrl = undefined;
    if (baseUrl && typeof baseUrl === 'string' && baseUrl.startsWith('https://')) {
      postbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/webhook`;
    }

    const pixResult = await createPixTransaction({
      variantId,
      customer,
      postbackUrl
    });

    return res.status(200).json(pixResult);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[API /api/pix Error]:', err.message, 'Status:', status);

    let message = 'Não foi possível gerar o Pix agora. Tente novamente.';
    if (err.message && err.message.includes('CONFIG_ERROR')) {
      message = 'Chave INVICTUS_API_KEY não configurada na Vercel (Project Settings > Environment Variables). Adicione a variável e redeploy.';
    } else if (status === 400 || (err.message && status !== 500)) {
      message = err.message;
    }

    return res.status(status).json({ error: message });
  }
};
