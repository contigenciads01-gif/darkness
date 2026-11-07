/**
 * Cliente da API OmegaPay (OmegaPayments) e regras de negócio.
 * Roda EXCLUSIVAMENTE no servidor (Node.js).
 */

const OMEGA_BASE_URL = 'https://app.omegapayments.com.br/api/v1';

// Preço oficial do produto no servidor (R$ 297,00)
const PRICE_BRL = 297;

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
 * Criação da cobrança Pix na OmegaPay
 */
async function createPixTransaction({ variantId, customer, callbackUrl }) {
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

  const publicKey = process.env.OMEGA_PUBLIC_KEY;
  const secretKey = process.env.OMEGA_SECRET_KEY;

  if (!publicKey || !secretKey) {
    const err = new Error('CONFIG_ERROR: Credenciais OMEGA_PUBLIC_KEY e/ou OMEGA_SECRET_KEY não configuradas.');
    err.statusCode = 500;
    throw err;
  }

  const variant = variantCheck.variant;
  const cleanCustomer = customerCheck.data;
  const identifier = `tablet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const payload = {
    identifier,
    amount: PRICE_BRL,
    client: {
      name: cleanCustomer.name,
      email: cleanCustomer.email,
      phone: cleanCustomer.phone,
      document: cleanCustomer.document
    },
    products: [
      {
        id: variantId,
        name: `Tablet Android 17 Pro Max 2 em 1 - ${variant.color}`,
        quantity: 1,
        price: PRICE_BRL
      }
    ],
    metadata: {
      variantId,
      source: 'checkout_tablet_17_pro_max'
    }
  };

  if (callbackUrl && typeof callbackUrl === 'string' && callbackUrl.startsWith('https://')) {
    payload.callbackUrl = callbackUrl;
  }

  const response = await fetch(`${OMEGA_BASE_URL}/gateway/pix/receive`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'x-public-key': publicKey,
      'x-secret-key': secretKey
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch (e) {
    console.error('OmegaPay non-JSON response HTTP', response.status);
    const err = new Error('Não foi possível gerar o Pix agora. Tente novamente.');
    err.statusCode = 502;
    throw err;
  }

  if (!response.ok) {
    console.error('OmegaPay create transaction error HTTP', response.status, json);
    const userMessage = json?.message || json?.errorDescription || json?.error || 'Não foi possível gerar o Pix agora. Tente novamente.';
    const err = new Error(userMessage);
    err.statusCode = response.status === 400 || response.status === 422 ? 400 : 502;
    throw err;
  }

  const transactionId = json.transactionId || json.id;
  const copyPaste = json.pix?.code || '';
  const qrImage = json.pix?.image || (copyPaste ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(copyPaste)}` : '');
  const expiresInSeconds = 1800;

  return {
    id: transactionId,
    copyPaste,
    qrImage,
    expiresInSeconds
  };
}

/**
 * Consulta de status da transação na OmegaPay
 */
async function getTransactionStatus(txId) {
  const publicKey = process.env.OMEGA_PUBLIC_KEY;
  const secretKey = process.env.OMEGA_SECRET_KEY;

  if (!publicKey || !secretKey) {
    throw new Error('CONFIG_ERROR: Credenciais da OmegaPay não configuradas.');
  }

  if (!txId || typeof txId !== 'string') {
    const err = new Error('ID de transação inválido.');
    err.statusCode = 400;
    throw err;
  }

  const response = await fetch(`${OMEGA_BASE_URL}/gateway/transactions?id=${encodeURIComponent(txId)}`, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-public-key': publicKey,
      'x-secret-key': secretKey
    }
  });

  if (!response.ok) {
    const err = new Error(`Falha ao consultar transação na OmegaPay (HTTP ${response.status}).`);
    err.statusCode = response.status === 404 ? 404 : 502;
    throw err;
  }

  const json = await response.json();
  const rawStatus = (json.status || '').toUpperCase();

  // Mapeamento normalizado
  let status = 'pending';
  if (rawStatus === 'COMPLETED' || rawStatus === 'PAID' || json.payedAt) {
    status = 'paid';
  } else if (rawStatus === 'EXPIRED') {
    status = 'expired';
  } else if (rawStatus === 'FAILED' || rawStatus === 'CANCELED' || rawStatus === 'DENIED') {
    status = 'failed';
  }

  return { status };
}

module.exports = {
  isValidCPF,
  validateCustomer,
  validateVariant,
  createPixTransaction,
  getTransactionStatus,
  PRICE_BRL,
  ALLOWED_VARIANTS
};
