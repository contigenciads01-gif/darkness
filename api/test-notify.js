const { notifyPixPending, notifyPixPaid } = require('../lib/notify');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const { type } = req.query || {};

  try {
    if (type === 'paid') {
      await notifyPixPaid({
        transactionId: 'teste_' + Math.random().toString(36).substring(2, 7),
        amountFormatted: 'R$ 297,00'
      });
      return res.status(200).json({ ok: true, message: 'Notificação de Venda Aprovada enviada com sucesso!' });
    } else {
      await notifyPixPending({
        customer: {
          name: 'Comprador Teste',
          phone: '(41) 98502-7558',
          address: { city: 'São Paulo', state: 'SP' }
        },
        variantLabel: 'Azul',
        amountFormatted: 'R$ 297,00'
      });
      return res.status(200).json({ ok: true, message: 'Notificação de Venda Pendente enviada com sucesso!' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
