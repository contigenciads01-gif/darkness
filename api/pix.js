const omega = require('../lib/omegapay');
const invictus = require('../lib/invictus');
const { notifyPixPending } = require('../lib/notify');

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

    // Constrói callbackUrl apenas se for HTTPS válido
    const baseUrl = process.env.PUBLIC_BASE_URL;
    let callbackUrl = undefined;
    if (baseUrl && typeof baseUrl === 'string' && baseUrl.startsWith('https://')) {
      callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/webhook`;
    }

    // Prioriza OmegaPay se as credenciais estiverem configuradas
    const isOmegaConfigured = !!(process.env.OMEGA_PUBLIC_KEY && process.env.OMEGA_SECRET_KEY);
    const pixResult = isOmegaConfigured
      ? await omega.createPixTransaction({ variantId, customer, callbackUrl })
      : await invictus.createPixTransaction({ variantId, customer, postbackUrl: callbackUrl });

    // Notificação Push de Venda Pendente (Pix Gerado)
    notifyPixPending({
      customer,
      variantLabel: variantId,
      amountFormatted: 'R$ 297,00'
    }).catch(e => console.error('[Notify error]:', e.message));

    return res.status(200).json(pixResult);
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[API /api/pix Error]:', err.message, 'Status:', status);

    let message = 'Não foi possível gerar o Pix agora. Tente novamente.';
    if (err.message && err.message.includes('CONFIG_ERROR')) {
      message = 'Credenciais da API não configuradas na Vercel (Project Settings > Environment Variables). Adicione OMEGA_PUBLIC_KEY e OMEGA_SECRET_KEY.';
    } else if (status === 400 || (err.message && status !== 500)) {
      message = err.message;
    }

    return res.status(status).json({ error: message });
  }
};
