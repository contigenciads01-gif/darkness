const omega = require('../lib/omegapay');
const invictus = require('../lib/invictus');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'JSON malformatado.' });
    }
  }

  const transactionId = body?.transactionId || body?.id || body?.transaction?.id;
  if (!transactionId) {
    console.log('[Webhook] Recebido sem ID de transação, respondendo 200.');
    return res.status(200).json({ received: true });
  }

  try {
    const isOmegaConfigured = !!(process.env.OMEGA_PUBLIC_KEY && process.env.OMEGA_SECRET_KEY);
    const verified = isOmegaConfigured
      ? await omega.getTransactionStatus(transactionId)
      : await invictus.getTransactionStatus(transactionId);

    console.log(`[Webhook] Transação ${transactionId} confirmada com status: ${verified.status}`);

    if (verified.status === 'paid') {
      console.log(`[Pedido Confirmado] Pedido referente à transação ${transactionId} marcado como pago.`);
    }

    return res.status(200).json({ received: true, status: verified.status });
  } catch (err) {
    console.error(`[Webhook Erro] Falha ao consultar transação ${transactionId}:`, err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
};
