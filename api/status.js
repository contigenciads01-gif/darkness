const omega = require('../lib/omegapay');
const invictus = require('../lib/invictus');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido. Utilize GET.' });
  }

  const { id } = req.query || {};

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Parâmetro id é obrigatório.' });
  }

  try {
    const isOmegaConfigured = !!(process.env.OMEGA_PUBLIC_KEY && process.env.OMEGA_SECRET_KEY);
    const statusData = isOmegaConfigured
      ? await omega.getTransactionStatus(id)
      : await invictus.getTransactionStatus(id);

    return res.status(200).json(statusData);
  } catch (err) {
    if (err.statusCode === 429) {
      if (err.retryAfter) {
        res.setHeader('Retry-After', err.retryAfter);
      }
      return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' });
    }

    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message || 'Erro ao consultar status.' });
  }
};
