/**
 * Módulo de Disparo de Notificações Push para Celular/Navegador (Google Chrome / Android)
 */

const DEFAULT_TOPIC = 'tablet17_vendas_thiago';

async function sendPushNotification({ title, message, priority = 'default', tags = [] }) {
  const topic = process.env.NOTIFY_TOPIC || DEFAULT_TOPIC;
  const url = `https://ntfy.sh/${encodeURIComponent(topic)}`;

  try {
    const headers = {
      'Title': title,
      'Priority': priority,
      'Tags': tags.join(',')
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: message
    });

    if (!res.ok) {
      console.warn('[Notify] Falha ao enviar notificação push:', res.status);
    } else {
      console.log(`[Notify] Notificação enviada com sucesso para o tópico ${topic}: "${title}"`);
    }
  } catch (err) {
    console.error('[Notify] Erro ao disparar notificação:', err.message);
  }
}

/**
 * Notificação de Pix Gerado / Venda Pendente
 */
async function notifyPixPending({ customer, variantLabel, amountFormatted }) {
  const name = customer.name || 'Cliente';
  const phone = customer.phone || '';
  const city = customer.address?.city || '';
  const state = customer.address?.state || '';

  const title = `🔔 Pix Gerado: ${amountFormatted || 'R$ 297,00'} (Venda Pendente)`;
  const message = `Cliente: ${name}\nTelefone/Zap: ${phone}\nModelo: ${variantLabel || 'Azul'}${city ? '\nLocal: ' + city + '/' + state : ''}`;

  await sendPushNotification({
    title,
    message,
    priority: 'high',
    tags: ['hourglass', 'moneybag', 'bell']
  });
}

/**
 * Notificação de Venda Aprovada / Pix Pago
 */
async function notifyPixPaid({ transactionId, amountFormatted }) {
  const title = `🎉 Venda Aprovada! Pix Pago (${amountFormatted || 'R$ 297,00'})`;
  const message = `O pagamento da transação ${transactionId || ''} foi confirmado com sucesso na OmegaPay!`;

  await sendPushNotification({
    title,
    message,
    priority: 'max',
    tags: ['tada', 'white_check_mark', 'money_with_wings']
  });
}

module.exports = {
  sendPushNotification,
  notifyPixPending,
  notifyPixPaid,
  DEFAULT_TOPIC
};
