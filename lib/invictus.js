/**
 * Cliente da API InvictusPay (API Seller v1) e validações de negócio.
 * Este arquivo roda EXCLUSIVAMENTE no servidor (Node.js).
 * NUNCA importe este arquivo no front-end.
 */

const INVICTUS_BASE_URL = 'https://api.invictuspayv2.com.br/api/v1';

// Preço oficial do produto no servidor (sempre em centavos: R$ 297,00)
const PRICE_CENTS = 29700;

// Variações ativas permitidas para compra
const ALLOWED_VARIANTS = {
  'modelo-2': { label: 'Tablet 2 em 1 - Azul', color: 'Azul' },
  'modelo-preto': { label: 'Tablet 2 em 1 - Preto', color: 'Preto' },
  'modelo-rosa': { label: 'Tablet 2 em 1 - Rosa', color: 'Rosa' }
};

/**
 * Validação de CPF com dígitos verificadores
 */
function isValidCPF(cpf) {
  if (typeof cpf !== 'string') return false;
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * Validação dos dados do comprador
 */
function validateCustomer(customer) {
  if (!customer || typeof customer !== 'object') {
    return { valid: false, error: 'Dados do cliente não informados.' };
  }

  const name = typeof customer.name === 'string' ? customer.name.trim() : '';
  if (name.length < 3 || name.length > 120) {
    return { valid: false, error: 'Por favor, informe seu nome completo (mínimo 3 caracteres).' };
  }

  const email = typeof customer.email === 'string' ? customer.email.trim() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { valid: false, error: 'Por favor, informe um e-mail válido.' };
  }

  const document = typeof customer.document === 'string' ? customer.document.replace(/\D/g, '') : '';
  if (!isValidCPF(document)) {
    return { valid: false, error: 'CPF inválido. Por favor, verifique os dígitos digitados.' };
  }

  const phone = typeof customer.phone === 'string' ? customer.phone.replace(/\D/g, '') : '';
  if (phone.length < 10 || phone.length > 11) {
    return { valid: false, error: 'Telefone inválido. Informe DDD + número (ex: 11999999999).' };
  }

  return {
    valid: true,
    data: {
      name,
      email,
      document,
      phone
    }
  };
}

/**
 * Validação da variação do produto
 */
function validateVariant(variantId) {
  if (!variantId || typeof variantId !== 'string') {
    return { valid: false, error: 'Variação não selecionada.' };
  }

  const variant = ALLOWED_VARIANTS[variantId];
  if (!variant) {
    return {
      valid: false,
      error: 'Variação indisponível ou esgotada. Por favor, selecione Azul, Preto ou Rosa.'
    };
  }

  return { valid: true, variant };
}

/**
 * Extração resiliente dos dados do Pix (conforme seção 4.4)
 */
function extractPix(data) {
  const pix = (data && typeof data.pix === 'object' && data.pix !== null) ? data.pix : {};
  
  // copyPaste
  const copyPaste = 
    pix.copyPaste || 
    pix.copy_paste || 
    pix.emv || 
    pix.payload || 
    pix.code || 
    pix.qrcode_text || 
    data.copyPaste || 
    data.copy_paste || 
    data.emv ||
    data.pix_code ||
    '';

  // qrImage
  const qrImage = 
    pix.qrImage || 
    pix.qr_image || 
    pix.qrcode_image || 
    pix.qrcode || 
    pix.qr_code || 
    pix.image || 
    pix.url || 
    pix.qr_code_url || 
    data.qrImage || 
    data.qr_image || 
    data.qrcode ||
    '';

  const expiresInSeconds = 
    pix.expirationInSeconds || 
    pix.expiration_in_seconds || 
    pix.expiresInSeconds || 
    1800;

  return {
    copyPaste,
    qrImage,
    expiresInSeconds
  };
}

/**
 * Criação da cobrança Pix na InvictusPay
 */
async function createPixTransaction({ variantId, customer, postbackUrl }) {
  const variantCheck = validateVariant(variantId);
  if (!variantCheck.valid) {
    const err = new Error(variantCheck.error);
    err.statusCode = 400;
    throw err;
  }

  const customerCheck = validateCustomer(customer);
  if (!customerCheck.valid) {
    const err = new Error(customerCheck.error);
    err.statusCode = 400;
    throw err;
  }

  const apiKey = process.env.INVICTUS_API_KEY;
  if (!apiKey) {
    const err = new Error('CONFIG_ERROR: Chave da API InvictusPay não configurada no servidor.');
    err.statusCode = 500;
    throw err;
  }

  const cleanCustomer = customerCheck.data;
  const variant = variantCheck.variant;

  const payload = {
    amount: PRICE_CENTS,
    paymentMethod: 'pix',
    customer: {
      name: cleanCustomer.name,
      email: cleanCustomer.email,
      document: cleanCustomer.document,
      phone: cleanCustomer.phone
    },
    items: [
      {
        description: variant.label,
        quantity: 1,
        amount: PRICE_CENTS,
        externalRef: variantId
      }
    ],
    pix: {
      expirationInSeconds: 1800
    }
  };

  if (postbackUrl && typeof postbackUrl === 'string' && postbackUrl.startsWith('https://')) {
    payload.postbackUrl = postbackUrl;
  }

  const response = await fetch(`${INVICTUS_BASE_URL}/transactions`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch (e) {
    console.error('InvictusPay non-JSON response HTTP', response.status);
    const err = new Error('Não foi possível gerar o Pix agora. Tente novamente.');
    err.statusCode = 502;
    throw err;
  }

  if (!response.ok) {
    console.error('InvictusPay create transaction error HTTP', response.status, json?.error || json?.message);
    const userMessage = json?.error || json?.message || 'Não foi possível gerar o Pix agora. Tente novamente.';
    const err = new Error(userMessage);
    err.statusCode = response.status === 400 || response.status === 422 ? 400 : 502;
    throw err;
  }

  const data = json.data || json;
  // Log apenas das chaves da resposta para inspeção sem expor dados sensíveis (conforme seção 4.4)
  console.log('pix response keys:', JSON.stringify(Object.keys(data)), data.pix && Object.keys(data.pix));

  const pixData = extractPix(data);
  const id = data.id || json.id;

  return {
    id,
    copyPaste: pixData.copyPaste,
    qrImage: pixData.qrImage,
    expiresInSeconds: pixData.expiresInSeconds
  };
}

/**
 * Consulta de status de transação na InvictusPay
 */
async function getTransactionStatus(txId) {
  const apiKey = process.env.INVICTUS_API_KEY;
  if (!apiKey) {
    throw new Error('CONFIG_ERROR: Chave da API InvictusPay não configurada.');
  }

  // Validação do ID (alfanumérico, 10 a 40 caracteres, ex: ULID)
  if (!txId || typeof txId !== 'string' || !/^[A-Za-z0-9_-]{10,40}$/.test(txId)) {
    const err = new Error('ID de transação inválido.');
    err.statusCode = 400;
    throw err;
  }

  const response = await fetch(`${INVICTUS_BASE_URL}/transactions/${encodeURIComponent(txId)}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'X-Api-Key': apiKey
    }
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after') || '5';
    const err = new Error('Limite de requisições excedido.');
    err.statusCode = 429;
    err.retryAfter = retryAfter;
    throw err;
  }

  if (!response.ok) {
    console.error('InvictusPay get status error HTTP', response.status);
    const err = new Error('Erro ao consultar status da transação.');
    err.statusCode = response.status === 404 ? 404 : 502;
    throw err;
  }

  const json = await response.json();
  const tx = json.data || json;

  return {
    status: tx.status || 'pending'
  };
}

module.exports = {
  PRICE_CENTS,
  ALLOWED_VARIANTS,
  isValidCPF,
  validateCustomer,
  validateVariant,
  createPixTransaction,
  getTransactionStatus,
  extractPix
};
