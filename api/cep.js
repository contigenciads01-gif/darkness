module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { cep } = req.query || {};
  const cleanCep = typeof cep === 'string' ? cep.replace(/\D/g, '') : '';

  if (cleanCep.length !== 8) {
    return res.status(400).json({ error: 'CEP inválido. Deve conter 8 dígitos.' });
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Falha ao consultar CEP no serviço de correios.' });
    }

    const data = await response.json();

    if (data.erro) {
      return res.status(404).json({ error: 'CEP não encontrado.' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');

    return res.status(200).json({
      cep: data.cep,
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || ''
    });
  } catch (err) {
    console.error('Erro na consulta de CEP:', err.message);
    return res.status(500).json({ error: 'Erro interno ao processar CEP.' });
  }
};
