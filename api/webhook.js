const { getTransactionStatus } = require('../lib/invictus');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  // Verifica o cabeçalho do evento do webhook
  const eventHeader = req.headers['x-webhook-event'] || req.headers['X-Webhook-Event'];
  if (!eventHeader || typeof eventHeader !== 'string' || !eventHeader.startsWith('EVENT:CHARGE_')) {
    // Pode ser ping de teste ou evento não relacionado a cobrança
    console.log('Webhook recebido com evento ignorado ou não reconhecido:', eventHeader);
    return res.status(200).json({ received: true, ignored: true });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'JSON malformatado.' });
    }
  }

  const transactionId = body?.transaction?.id;
  if (!transactionId) {
    console.warn('Webhook recebido sem transaction.id');
    return res.status(200).json({ received: true, error: 'transaction.id ausente' });
  }

  try {
    // Conforme seção 4.6: NÃO confia no corpo do postback; consulta a API oficial para confirmar status
    const verified = await getTransactionStatus(transactionId);
    console.log(`[Webhook] Transação ${transactionId} confirmada na API com status: ${verified.status}`);

    if (verified.status === 'paid') {
      // TODO: Salvar pedido como pago no banco de dados
      // TODO: Enviar confirmação de compra por e-mail ou WhatsApp
      console.log(`[Pedido Confirmado] Pedido referente à transação ${transactionId} marcado como pago.`);
    }

    return res.status(200).json({ received: true, status: verified.status });
  } catch (err) {
    console.error(`[Webhook Erro] Falha ao consultar transação ${transactionId}:`, err.message);
    // Retorna 500 para que a InvictusPay realize as retentativas automáticas (30s, 60s, 120s)
    return res.status(500).json({ error: 'Erro ao validar webhook com a API da InvictusPay.' });
  }
};
