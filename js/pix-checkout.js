/**
 * Checkout em Página Inteira Integrado - 3 Etapas (Identificação, Entrega, Pagamento)
 * InvictusPay API Seller v1 + ViaCEP Proxy (/api/cep)
 */

(function() {
  'use strict';

  // Configurações gerais
  const CARD_MODE = 'hidden'; // 'hidden' | 'soon' | 'hosted'
  const PRICE_CENTS = 29700;
  const PRICE_FORMATTED = 'R$ 297,00';
  const BASE_PRODUCT_TITLE = 'Tablet Android 17 Pro Max 2 em 1';

  const VARIANTS = {
    'modelo-2': { label: 'Azul', image: 'images/tablet-azul.webp' },
    'modelo-preto': { label: 'Preto', image: 'images/tablet-preto.webp' },
    'modelo-rosa': { label: 'Rosa', image: 'images/tablet-rosa-nitido.jpg' },
    'modelo-1': { label: 'Cinza', image: 'images/tablet-cinza.webp' },
    'modelo-3': { label: 'Laranja', image: 'images/tablet-laranja.webp' }
  };

  // Estado da aplicação
  let currentVariantId = 'modelo-2';
  let currentStep = 1; // 1: Identificação, 2: Entrega, 3: Pagamento
  let isSubmittingPix = false;
  let activeTransactionId = null;
  let statusPollInterval = null;
  let expirationTimerInterval = null;
  let remainingSeconds = 1800;
  let reviewsList = [];
  let sealsList = [];

  const customerData = {
    name: '',
    email: '',
    phone: '',
    cpf: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  };

  // Utilitários de Máscara
  function maskCPF(val) {
    return val
      .replace(/\D/g, '')
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function maskPhone(val) {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    }
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  }

  function maskCEP(val) {
    return val
      .replace(/\D/g, '')
      .slice(0, 8)
      .replace(/(\d{5})(\d)/, '$1-$2');
  }

  // Validador de CPF com dígitos verificadores
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

  // Inicialização
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckoutSystem);
  } else {
    initCheckoutSystem();
  }

  async function initCheckoutSystem() {
    loadJsonData();
    buildCheckoutDOM();
    bindProductPageTriggers();
    handleInitialUrlHash();
    setupHistoryHandling();
  }

  // Carrega seals.json e reviews.json se existirem
  async function loadJsonData() {
    try {
      const sealsRes = await fetch('data/seals.json');
      if (sealsRes.ok) {
        sealsList = await sealsRes.json();
        renderSeals();
      }
    } catch (e) {}

    try {
      const reviewsRes = await fetch('data/reviews.json');
      if (reviewsRes.ok) {
        reviewsList = await reviewsRes.json();
        renderReviews();
      }
    } catch (e) {}
  }

  // Conecta o botão "Comprar agora" da página de produto
  function bindProductPageTriggers() {
    const buyBtn = document.getElementById('bottom-buy-btn');
    if (buyBtn) {
      buyBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const vid = buyBtn.dataset.variantId || 'modelo-2';
        openCheckout(vid);
      });
    }

    // Também verifica outros botões com intenção de compra
    document.querySelectorAll('a[href*="checkout"], button[data-action="buy"]').forEach(btn => {
      if (btn.id !== 'bottom-buy-btn') {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          const vid = buyBtn ? (buyBtn.dataset.variantId || 'modelo-2') : 'modelo-2';
          openCheckout(vid);
        });
      }
    });
  }

  // Criação da estrutura DOM completa do Checkout
  function buildCheckoutDOM() {
    if (document.getElementById('checkout-fullscreen-container')) return;

    const container = document.createElement('div');
    container.id = 'checkout-fullscreen-container';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');
    container.setAttribute('aria-label', 'Checkout Seguro');

    container.innerHTML = `
      <!-- CABEÇALHO FIXO -->
      <header class="checkout-header">
        <div class="checkout-header-inner">
          <button id="checkout-back-to-store-btn" type="button" class="checkout-back-btn" aria-label="Voltar para a página da loja">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            <span>Voltar à loja</span>
          </button>

          <div class="checkout-header-logo">
            <img src="images/checkout-badge.png" alt="Envio com Rastreamento | Compra Protegida" onerror="this.parentElement.innerHTML='<span style=\\'font-weight:700;font-size:15px;color:var(--checkout-text)\\'>Tablet 17 Pro Max</span>'">
          </div>

          <div class="checkout-header-security">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span class="hidden sm:inline">Pagamento 100% Seguro</span>
            <span class="sm:hidden">Seguro</span>
          </div>
        </div>
      </header>

      <!-- CONTEÚDO PRINCIPAL -->
      <main class="checkout-main-content">
        
        <!-- RESUMO RECOLHÍVEL NO CELULAR (< 960px) -->
        <div class="checkout-mobile-summary-wrapper lg:hidden">
          <button id="checkout-mobile-summary-toggle-btn" type="button" class="checkout-mobile-summary-toggle" aria-expanded="false" aria-controls="checkout-mobile-summary-content">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
              <span>Resumo do pedido</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span id="checkout-mobile-total-display" style="font-weight:700;color:var(--checkout-text);">${PRICE_FORMATTED}</span>
              <svg id="checkout-mobile-summary-arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s;"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </button>
          <div id="checkout-mobile-summary-content" class="checkout-order-summary-card" style="display:none;margin-bottom:16px;">
            <div id="checkout-mobile-summary-inner"></div>
          </div>
        </div>

        <!-- COLUNA ESQUERDA: ETAPAS DO CHECKOUT -->
        <div class="checkout-left-col">
          
          <!-- BARRA DE PROGRESSO DAS ETAPAS -->
          <div class="checkout-steps-bar" role="tablist" aria-label="Etapas da compra">
            <button id="step-nav-1" type="button" class="checkout-step-indicator active clickable" aria-label="Ir para etapa 1: Identificação">
              <span class="checkout-step-circle">1</span>
              <span class="checkout-step-label">Identificação</span>
            </button>
            <button id="step-nav-2" type="button" class="checkout-step-indicator" aria-label="Ir para etapa 2: Entrega">
              <span class="checkout-step-circle">2</span>
              <span class="checkout-step-label">Entrega</span>
            </button>
            <button id="step-nav-3" type="button" class="checkout-step-indicator" aria-label="Ir para etapa 3: Pagamento">
              <span class="checkout-step-circle">3</span>
              <span class="checkout-step-label">Pagamento</span>
            </button>
          </div>

          <!-- ETAPA 1: IDENTIFICAÇÃO -->
          <div id="step-card-1" class="checkout-card" data-step="1">
            <div class="checkout-card-header">
              <div class="checkout-card-title-group">
                <div>
                  <h2 class="checkout-card-title">Identificação</h2>
                  <p class="checkout-card-subtitle">Preencha seus dados para envio do pedido.</p>
                </div>
              </div>
              <span class="checkout-card-step-badge">1 de 3</span>
            </div>

            <!-- Formulário Ativo da Etapa 1 -->
            <div id="step-1-form-container">
              <form id="form-step-1" novalidate>
                <div class="checkout-form-group">
                  <label for="input-customer-name" class="checkout-label">Nome completo *</label>
                  <input type="text" id="input-customer-name" class="checkout-input" placeholder="Digite seu nome completo" required autocomplete="name">
                  <div id="error-customer-name" class="checkout-field-error">Por favor, informe seu nome completo (ao menos 3 letras).</div>
                </div>

                <div class="checkout-form-group">
                  <label for="input-customer-email" class="checkout-label">E-mail *</label>
                  <input type="email" id="input-customer-email" class="checkout-input" placeholder="seuemail@exemplo.com" required autocomplete="email" inputmode="email">
                  <div id="error-customer-email" class="checkout-field-error">Informe um endereço de e-mail válido.</div>
                </div>

                <div class="checkout-form-row two-cols">
                  <div class="checkout-form-group">
                    <label for="input-customer-phone" class="checkout-label">Celular / WhatsApp *</label>
                    <input type="tel" id="input-customer-phone" class="checkout-input" placeholder="(00) 00000-0000" required autocomplete="tel" inputmode="numeric">
                    <div id="error-customer-phone" class="checkout-field-error">Informe DDD + número de celular válido.</div>
                  </div>

                  <div class="checkout-form-group">
                    <label for="input-customer-cpf" class="checkout-label">CPF *</label>
                    <input type="text" id="input-customer-cpf" class="checkout-input" placeholder="000.000.000-00" required inputmode="numeric">
                    <div id="error-customer-cpf" class="checkout-field-error">CPF inválido. Verifique os dígitos digitados.</div>
                  </div>
                </div>

                <button id="btn-submit-step-1" type="submit" class="checkout-btn-primary">
                  <span>Ir Para Entrega</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </form>
            </div>

            <!-- Resumo Recolhido da Etapa 1 -->
            <div id="step-1-collapsed-summary" class="checkout-step-collapsed" style="display:none;">
              <div class="checkout-collapsed-info">
                <div class="checkout-collapsed-check">✓</div>
                <div>
                  <div id="collapsed-step-1-name" class="checkout-collapsed-text">Nome do Cliente</div>
                  <div id="collapsed-step-1-sub" class="checkout-collapsed-detail">email@exemplo.com · (00) 00000-0000</div>
                </div>
              </div>
              <button id="btn-edit-step-1" type="button" class="checkout-edit-step-btn">Alterar</button>
            </div>
          </div>

          <!-- ETAPA 2: ENTREGA -->
          <div id="step-card-2" class="checkout-card" data-step="2">
            <div class="checkout-card-header">
              <div class="checkout-card-title-group">
                <div>
                  <h2 class="checkout-card-title">Entrega</h2>
                  <p id="step-2-header-subtitle" class="checkout-card-subtitle">Preencha seus dados de entrega para continuar.</p>
                </div>
              </div>
              <span class="checkout-card-step-badge">2 de 3</span>
            </div>

            <!-- Formulário Ativo da Etapa 2 -->
            <div id="step-2-form-container" style="display:none;">
              <form id="form-step-2" novalidate>
                <div class="checkout-form-group">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <label for="input-address-cep" class="checkout-label" style="margin-bottom:0;">CEP *</label>
                    <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--checkout-primary);text-decoration:underline;">Não sei meu CEP</a>
                  </div>
                  <div style="position:relative;">
                    <input type="text" id="input-address-cep" class="checkout-input" placeholder="00000-000" required inputmode="numeric" autocomplete="postal-code">
                    <span id="cep-loading-indicator" style="display:none;position:absolute;right:14px;top:17px;font-size:12px;color:var(--checkout-text-muted);">Buscando...</span>
                  </div>
                  <div id="error-address-cep" class="checkout-field-error">CEP inválido ou não encontrado.</div>
                </div>

                <div class="checkout-form-group">
                  <label for="input-address-street" class="checkout-label">Endereço / Logradouro *</label>
                  <input type="text" id="input-address-street" class="checkout-input" placeholder="Rua, Avenida, Praça..." required autocomplete="address-line1">
                  <div id="error-address-street" class="checkout-field-error">Por favor, informe seu endereço.</div>
                </div>

                <div class="checkout-form-row two-cols">
                  <div class="checkout-form-group">
                    <label for="input-address-number" class="checkout-label">Número *</label>
                    <input type="text" id="input-address-number" class="checkout-input" placeholder="Ex: 120" required>
                    <div id="error-address-number" class="checkout-field-error">Informe o número (ou S/N).</div>
                  </div>

                  <div class="checkout-form-group">
                    <label for="input-address-complement" class="checkout-label">Complemento (opcional)</label>
                    <input type="text" id="input-address-complement" class="checkout-input" placeholder="Apto, Bloco, Casa 2...">
                  </div>
                </div>

                <div class="checkout-form-row two-cols">
                  <div class="checkout-form-group">
                    <label for="input-address-neighborhood" class="checkout-label">Bairro *</label>
                    <input type="text" id="input-address-neighborhood" class="checkout-input" placeholder="Seu bairro" required>
                    <div id="error-address-neighborhood" class="checkout-field-error">Informe o bairro.</div>
                  </div>

                  <div class="checkout-form-group">
                    <label for="input-address-city" class="checkout-label">Cidade *</label>
                    <input type="text" id="input-address-city" class="checkout-input" placeholder="Sua cidade" required autocomplete="address-level2">
                    <div id="error-address-city" class="checkout-field-error">Informe a cidade.</div>
                  </div>
                </div>

                <div class="checkout-form-group">
                  <label for="input-address-state" class="checkout-label">Estado (UF) *</label>
                  <input type="text" id="input-address-state" class="checkout-input" placeholder="SP, RJ, MG..." maxlength="2" style="text-transform:uppercase;" required autocomplete="address-level1">
                  <div id="error-address-state" class="checkout-field-error">Informe o estado (UF).</div>
                </div>

                <button id="btn-submit-step-2" type="submit" class="checkout-btn-primary">
                  <span>Ir Para Pagamento</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </form>
            </div>

            <!-- Resumo Recolhido da Etapa 2 -->
            <div id="step-2-collapsed-summary" class="checkout-step-collapsed" style="display:none;">
              <div class="checkout-collapsed-info">
                <div class="checkout-collapsed-check">✓</div>
                <div>
                  <div id="collapsed-step-2-street" class="checkout-collapsed-text">Rua das Flores, 123</div>
                  <div id="collapsed-step-2-city" class="checkout-collapsed-detail">Bairro - Cidade/UF · Frete Grátis</div>
                </div>
              </div>
              <button id="btn-edit-step-2" type="button" class="checkout-edit-step-btn">Alterar</button>
            </div>
          </div>

          <!-- ETAPA 3: PAGAMENTO -->
          <div id="step-card-3" class="checkout-card" data-step="3">
            <div class="checkout-card-header">
              <div class="checkout-card-title-group">
                <div>
                  <h2 class="checkout-card-title">Pagamento</h2>
                  <p id="step-3-header-subtitle" class="checkout-card-subtitle">Selecione o método e conclua seu pedido.</p>
                </div>
              </div>
              <span class="checkout-card-step-badge">3 de 3</span>
            </div>

            <div id="step-3-content-container" style="display:none;">
              
              <!-- ABAS DE PAGAMENTO -->
              <div class="checkout-payment-tabs" id="payment-tabs-container">
                <button type="button" id="tab-pix-btn" class="checkout-tab-btn active">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 512 512" fill="currentColor" style="color:var(--checkout-primary);"><path d="M112.5 131.7L189.8 209c12.5 12.5 32.8 12.5 45.3 0l77.3-77.3c12.5-12.5 12.5-32.8 0-45.3L235.1 9.1c-12.5-12.5-32.8-12.5-45.3 0L112.5 86.4c-12.5 12.5-12.5 32.8 0 45.3zM9.1 235.1c-12.5 12.5-12.5 32.8 0 45.3l77.3 77.3c12.5 12.5 32.8 12.5 45.3 0l77.3-77.3c12.5-12.5 12.5-32.8 0-45.3L131.7 157.8c-12.5-12.5-32.8-12.5-45.3 0L9.1 235.1zm493.8 0l-77.3-77.3c-12.5-12.5-32.8-12.5-45.3 0L303 235.1c-12.5 12.5-12.5 32.8 0 45.3l77.3 77.3c12.5 12.5 32.8 12.5 45.3 0l77.3-77.3c12.5-12.5 12.5-32.8 0-45.3zM212.5 303l-77.3 77.3c-12.5 12.5-12.5 32.8 0 45.3l77.3 77.3c12.5 12.5 32.8 12.5 45.3 0l77.3-77.3c12.5-12.5 12.5-32.8 0-45.3L257.8 303c-12.5-12.5-32.8-12.5-45.3 0z"/></svg>
                  <span>Pix Oficial</span>
                  <span style="font-size:11px;font-weight:700;color:var(--checkout-success);background:#DCFCE7;padding:2px 6px;border-radius:4px;margin-left:4px;">Aprovação Imediata</span>
                </button>
              </div>

              <!-- BANNER EXPLICATIVO PIX -->
              <div class="checkout-pix-info-banner">
                <div class="checkout-pix-info-compact">
                  <div class="checkout-pix-step-item">
                    <span style="font-size:16px;">📋</span>
                    <span>1. Copie o código</span>
                  </div>
                  <span class="checkout-pix-step-arrow">→</span>
                  <div class="checkout-pix-step-item">
                    <span style="font-size:16px;">📱</span>
                    <span>2. Abra seu banco</span>
                  </div>
                  <span class="checkout-pix-step-arrow">→</span>
                  <div class="checkout-pix-step-item">
                    <span style="font-size:16px;">⚡</span>
                    <span>3. Cole e pague</span>
                  </div>
                </div>
              </div>

              <!-- BOTÃO ANTES DE GERAR PIX -->
              <div id="pix-generation-pre-container">
                <div id="pix-general-error" class="checkout-field-error" style="margin-bottom:12px;font-size:14px;padding:12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:10px;"></div>
                
                <button id="btn-generate-pix" type="button" class="checkout-btn-primary">
                  <span id="btn-generate-pix-text">Pagar ${PRICE_FORMATTED} com Pix</span>
                </button>
              </div>

              <!-- ÁREA DO QR CODE GERADO -->
              <div id="pix-active-display-container" style="display:none;margin-top:16px;">
                <div style="text-align:center;padding:16px 12px;background:#F9FAFB;border:1px solid var(--checkout-border);border-radius:14px;">
                  <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--checkout-success);background:#DCFCE7;padding:4px 10px;border-radius:20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    Código Pix gerado com sucesso!
                  </span>

                  <div style="margin-top:10px;font-size:14px;font-weight:700;color:var(--checkout-text);">
                    Valor: <span style="color:var(--checkout-primary);">${PRICE_FORMATTED}</span>
                  </div>

                  <div style="margin-top:4px;font-size:12px;color:var(--checkout-text-muted);">
                    Tempo restante: <span id="pix-timer-countdown" style="font-family:monospace;font-weight:700;color:var(--checkout-text);">30:00</span>
                  </div>

                  <!-- Imagem QR Code -->
                  <div style="margin-top:16px;display:inline-block;padding:10px;background:#FFFFFF;border:1px solid var(--checkout-border);border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
                    <img id="pix-qr-img" src="" alt="QR Code Pix" style="width:200px;height:200px;object-fit:contain;display:block;">
                  </div>
                  <div style="font-size:12px;color:var(--checkout-text-muted);margin-top:8px;">Aponte a câmera do seu aplicativo de banco para pagar</div>
                </div>

                <!-- Campo Copia e Cola -->
                <div style="margin-top:16px;">
                  <label for="pix-copy-input" class="checkout-label">Código Pix Copia e Cola:</label>
                  <div style="position:relative;display:flex;gap:8px;">
                    <input type="text" id="pix-copy-input" readonly class="checkout-input" style="font-family:monospace;font-size:13px;padding-right:90px;" onclick="this.select()">
                    <button id="btn-copy-pix-code" type="button" class="checkout-btn-primary" style="margin-top:0;height:52px;width:auto;padding:0 16px;white-space:nowrap;font-size:14px;">
                      Copiar
                    </button>
                  </div>
                  <div id="pix-copy-feedback" style="display:none;margin-top:8px;font-size:13px;font-weight:600;color:var(--checkout-success);text-align:center;">
                    ✓ Código Pix copiado para a área de transferência!
                  </div>
                </div>

                <!-- Guia Passo a Passo Completo -->
                <div class="checkout-pix-guide-full">
                  <div class="checkout-pix-guide-title">Como pagar pelo celular ou computador:</div>
                  <ol class="checkout-pix-guide-steps">
                    <li>
                      <span class="checkout-pix-guide-num">1</span>
                      <div>Abra o aplicativo do seu banco (Nubank, Itaú, Bradesco, Inter, Santander, Caixa, etc.).</div>
                    </li>
                    <li>
                      <span class="checkout-pix-guide-num">2</span>
                      <div>Escolha a opção <strong>Pix</strong> e depois <strong>Pix Copia e Cola</strong> (ou Ler QR Code).</div>
                    </li>
                    <li>
                      <span class="checkout-pix-guide-num">3</span>
                      <div>Cole o código copiado acima e confirme o pagamento de <strong>${PRICE_FORMATTED}</strong>.</div>
                    </li>
                  </ol>
                </div>

                <!-- Status em tempo real do pagamento -->
                <div id="pix-status-box" style="margin-top:20px;padding:16px;border-radius:12px;background:#F9FAFB;border:1px solid var(--checkout-border);display:flex;align-items:center;justify-content:center;gap:10px;">
                  <div id="pix-status-spinner" class="checkout-spinner" style="width:18px;height:18px;border:2px solid var(--checkout-primary);border-top-color:transparent;border-radius:50%;animation:checkout-spin 0.8s linear infinite;"></div>
                  <span id="pix-status-text" style="font-size:13px;font-weight:600;color:var(--checkout-text);">Aguardando confirmação do pagamento...</span>
                </div>

                <!-- Botão de gerar novo Pix caso expire ou falhe -->
                <div id="pix-retry-container" style="display:none;margin-top:14px;">
                  <button id="btn-retry-pix" type="button" class="checkout-btn-primary" style="background:#4B5563;">
                    Gerar novo código Pix
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>

        <!-- COLUNA DIREITA: SIDEBAR (DESKTOP) -->
        <aside class="checkout-sidebar">
          
          <!-- RESUMO DO PEDIDO -->
          <div class="checkout-order-summary-card">
            <h2 class="checkout-card-title" style="margin-bottom:16px;">Resumo do pedido</h2>
            <div id="checkout-desktop-summary-inner"></div>
          </div>

          <!-- BLOCO DE CONFIANÇA -->
          <div class="checkout-trust-card">
            <div class="checkout-trust-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--checkout-success);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
              <span>Compra 100% Segura</span>
            </div>
            <ul class="checkout-trust-items">
              <li class="checkout-trust-item">
                <span class="checkout-trust-icon">🔒</span>
                <div><strong>Conexão Criptografada:</strong> Seus dados pessoais e de entrega estão totalmente protegidos.</div>
              </li>
              <li class="checkout-trust-item">
                <span class="checkout-trust-icon">🛡️</span>
                <div><strong>Garantia CDC:</strong> 90 dias de garantia legal + 7 dias para desistir da compra (Código de Defesa do Consumidor).</div>
              </li>
              <li class="checkout-trust-item">
                <span class="checkout-trust-icon">🚚</span>
                <div><strong>Frete Grátis Rastreado:</strong> Envio expresso para todo o Brasil com código de rastreamento oficial dos Correios.</div>
              </li>
              <li class="checkout-trust-item">
                <span class="checkout-trust-icon">⚡</span>
                <div><strong>Pix Oficial Banco Central:</strong> Pagamento processado instantaneamente com liquidação segura.</div>
              </li>
            </ul>
          </div>

          <!-- SEÇÃO DE SELOS (SEALS.JSON) -->
          <div id="checkout-seals-container"></div>

          <!-- SEÇÃO DE AVALIAÇÕES (REVIEWS.JSON) -->
          <div id="checkout-reviews-container"></div>

          <!-- FAQ (PERGUNTAS FREQUENTES) -->
          <div class="checkout-faq-card">
            <div class="checkout-faq-title">Dúvidas Frequentes</div>

            <details class="checkout-faq-item">
              <summary class="checkout-faq-question">
                <span>Em quanto tempo o Pix é confirmado?</span>
                <span style="font-size:16px;">+</span>
              </summary>
              <div class="checkout-faq-answer">
                A confirmação do Pix pela InvictusPay ocorre de forma instantânea, geralmente em menos de 10 segundos após você pagar no app do banco. A página atualiza automaticamente na mesma hora!
              </div>
            </details>

            <details class="checkout-faq-item">
              <summary class="checkout-faq-question">
                <span>Quando receberei o código de rastreio?</span>
                <span style="font-size:16px;">+</span>
              </summary>
              <div class="checkout-faq-answer">
                Após a confirmação do pagamento, seu pedido é despachado em até 24 a 48 horas úteis e o código de rastreamento é enviado direto para seu e-mail e WhatsApp informados.
              </div>
            </details>

            <details class="checkout-faq-item">
              <summary class="checkout-faq-question">
                <span>O produto tem garantia?</span>
                <span style="font-size:16px;">+</span>
              </summary>
              <div class="checkout-faq-answer">
                Sim! Você conta com 90 dias de garantia total contra qualquer defeito de fabricação e 7 dias corridos para devolução por arrependimento com reembolso integral, conforme o CDC.
              </div>
            </details>

            <details class="checkout-faq-item">
              <summary class="checkout-faq-question">
                <span>E se o código Pix expirar?</span>
                <span style="font-size:16px;">+</span>
              </summary>
              <div class="checkout-faq-answer">
                Não se preocupe! O código Pix tem validade de 30 minutos. Caso expire antes de você concluir, basta clicar no botão "Gerar novo código Pix" para emitir um novo na hora.
              </div>
            </details>
          </div>

        </aside>

      </main>

      <!-- RODAPÉ INSTITUCIONAL -->
      <footer class="checkout-footer">
        <div style="font-weight:700;color:var(--checkout-text);margin-bottom:4px;">IMPORTADO SHOP</div>
        <div>CNPJ: 52.883.194/0001-08 · Todos os direitos reservados</div>
        <div style="margin-top:2px;">Atendimento: contato@importadoshop.com</div>
        <div class="checkout-footer-links">
          <a href="#termos" onclick="return false;">Termos de Uso</a>
          <a href="#privacidade" onclick="return false;">Política de Privacidade</a>
          <a href="#trocas" onclick="return false;">Trocas e Devoluções</a>
        </div>
      </footer>
    `;

    document.body.appendChild(container);

    setupEventListeners();
    updateSummaryDOM();
  }

  // Renderiza o resumo do pedido (usado tanto no desktop quanto no mobile)
  function renderSummaryHTML() {
    const v = VARIANTS[currentVariantId] || VARIANTS['modelo-2'];
    return `
      <div class="checkout-product-item">
        <img src="${v.image}" alt="${BASE_PRODUCT_TITLE} - ${v.label}" class="checkout-product-thumb">
        <div class="checkout-product-details">
          <div class="checkout-product-name">${BASE_PRODUCT_TITLE}</div>
          <div class="checkout-product-variant">Cor: <strong>${v.label}</strong> · Kit Completo (Teclado + Mouse)</div>
        </div>
        <div class="checkout-product-price">${PRICE_FORMATTED}</div>
      </div>

      <div style="background:#F0FDF4;border:1px dashed #86EFAC;border-radius:12px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">🎁</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#166534;">Garantia Estendida de 90 Dias</div>
            <div style="font-size:11px;color:#15803D;">Suporte prioritário e troca facilitada</div>
          </div>
        </div>
        <span class="checkout-badge-free">Brinde</span>
      </div>

      <div class="checkout-summary-lines">
        <div class="checkout-summary-line">
          <span>Subtotal</span>
          <span>${PRICE_FORMATTED}</span>
        </div>
        <div class="checkout-summary-line">
          <span>Frete para todo o Brasil</span>
          <span class="checkout-badge-free">Grátis</span>
        </div>
        <div class="checkout-summary-line total">
          <span>Total</span>
          <span style="color:var(--checkout-primary);">${PRICE_FORMATTED}</span>
        </div>
      </div>
    `;
  }

  function updateSummaryDOM() {
    const desktopSummary = document.getElementById('checkout-desktop-summary-inner');
    if (desktopSummary) desktopSummary.innerHTML = renderSummaryHTML();

    const mobileSummary = document.getElementById('checkout-mobile-summary-inner');
    if (mobileSummary) mobileSummary.innerHTML = renderSummaryHTML();

    const mobileTotalDisplay = document.getElementById('checkout-mobile-total-display');
    if (mobileTotalDisplay) mobileTotalDisplay.textContent = PRICE_FORMATTED;
  }

  // Renderiza selos oficiais apenas se data/seals.json tiver itens válidos
  function renderSeals() {
    const container = document.getElementById('checkout-seals-container');
    if (!container) return;

    if (!Array.isArray(sealsList) || sealsList.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="checkout-seals-section">';
    sealsList.forEach(seal => {
      if (seal.imageUrl && seal.name) {
        if (seal.verifyUrl) {
          html += `<a href="${seal.verifyUrl}" target="_blank" rel="noopener noreferrer" class="checkout-seal-link" title="${seal.name}">
            <img src="${seal.imageUrl}" alt="${seal.name}">
          </a>`;
        } else {
          html += `<div class="checkout-seal-link" title="${seal.name}">
            <img src="${seal.imageUrl}" alt="${seal.name}">
          </div>`;
        }
      }
    });
    html += '</div>';
    container.innerHTML = html;
  }

  // Renderiza avaliações apenas se data/reviews.json tiver itens válidos
  function renderReviews() {
    const container = document.getElementById('checkout-reviews-container');
    if (!container) return;

    if (!Array.isArray(reviewsList) || reviewsList.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = `
      <div class="checkout-reviews-card">
        <div class="checkout-trust-title" style="margin-bottom:12px;">
          <span>⭐ Avaliações de Clientes Verificados</span>
        </div>
        <div class="checkout-reviews-carousel">
    `;

    reviewsList.forEach(review => {
      const stars = '★'.repeat(review.rating || 5);
      html += `
        <div class="checkout-review-slide">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            ${review.avatar ? `<img src="${review.avatar}" alt="${review.author}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">` : ''}
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--checkout-text);">${review.author || 'Cliente'}</div>
              <div style="color:#EAB308;font-size:12px;">${stars}</div>
            </div>
          </div>
          <p style="font-size:12px;color:var(--checkout-text);line-height:1.4;margin:0;">"${review.comment || ''}"</p>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // Configuração dos Event Listeners do formulário e etapas
  function setupEventListeners() {
    // Voltar à loja
    const backBtn = document.getElementById('checkout-back-to-store-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => closeCheckout());
    }

    // Toggle Resumo Mobile
    const mobileToggle = document.getElementById('checkout-mobile-summary-toggle-btn');
    const mobileContent = document.getElementById('checkout-mobile-summary-content');
    const mobileArrow = document.getElementById('checkout-mobile-summary-arrow');
    if (mobileToggle && mobileContent) {
      mobileToggle.addEventListener('click', () => {
        const isClosed = mobileContent.style.display === 'none';
        mobileContent.style.display = isClosed ? 'block' : 'none';
        mobileToggle.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
        if (mobileArrow) {
          mobileArrow.style.transform = isClosed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
    }

    // Máscaras de entrada em tempo real
    const nameInput = document.getElementById('input-customer-name');
    const emailInput = document.getElementById('input-customer-email');
    const phoneInput = document.getElementById('input-customer-phone');
    const cpfInput = document.getElementById('input-customer-cpf');
    const cepInput = document.getElementById('input-address-cep');
    const stateInput = document.getElementById('input-address-state');

    if (phoneInput) {
      phoneInput.addEventListener('input', (e) => {
        e.target.value = maskPhone(e.target.value);
        clearFieldError('customer-phone');
      });
    }

    if (cpfInput) {
      cpfInput.addEventListener('input', (e) => {
        e.target.value = maskCPF(e.target.value);
        clearFieldError('customer-cpf');
      });
    }

    if (cepInput) {
      cepInput.addEventListener('input', (e) => {
        e.target.value = maskCEP(e.target.value);
        clearFieldError('address-cep');
        const clean = e.target.value.replace(/\D/g, '');
        if (clean.length === 8) {
          fetchAddressByCEP(clean);
        }
      });

      cepInput.addEventListener('blur', (e) => {
        const clean = e.target.value.replace(/\D/g, '');
        if (clean.length === 8) {
          fetchAddressByCEP(clean);
        }
      });
    }

    if (stateInput) {
      stateInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().slice(0, 2);
        clearFieldError('address-state');
      });
    }

    [nameInput, emailInput].forEach(inp => {
      if (inp) {
        inp.addEventListener('input', () => {
          clearFieldError(inp.id.replace('input-', ''));
        });
      }
    });

    // Submissão da Etapa 1
    const form1 = document.getElementById('form-step-1');
    if (form1) {
      form1.addEventListener('submit', (e) => {
        e.preventDefault();
        validateAndProceedStep1();
      });
    }

    // Submissão da Etapa 2
    const form2 = document.getElementById('form-step-2');
    if (form2) {
      form2.addEventListener('submit', (e) => {
        e.preventDefault();
        validateAndProceedStep2();
      });
    }

    // Botões de Alterar etapas recolhidas
    const edit1 = document.getElementById('btn-edit-step-1');
    if (edit1) edit1.addEventListener('click', () => goToStep(1));

    const edit2 = document.getElementById('btn-edit-step-2');
    if (edit2) edit2.addEventListener('click', () => goToStep(2));

    // Navegação direta clicável nas bolinhas concluídas
    const nav1 = document.getElementById('step-nav-1');
    const nav2 = document.getElementById('step-nav-2');
    const nav3 = document.getElementById('step-nav-3');

    if (nav1) nav1.addEventListener('click', () => goToStep(1));
    if (nav2) nav2.addEventListener('click', () => {
      if (currentStep > 2 || validateStep1Quietly()) goToStep(2);
    });
    if (nav3) nav3.addEventListener('click', () => {
      if (validateStep1Quietly() && validateStep2Quietly()) goToStep(3);
    });

    // Botão de Gerar Pix
    const btnGenPix = document.getElementById('btn-generate-pix');
    if (btnGenPix) {
      btnGenPix.addEventListener('click', createPixCharge);
    }

    // Botão Copiar Código Pix
    const btnCopyPix = document.getElementById('btn-copy-pix-code');
    if (btnCopyPix) {
      btnCopyPix.addEventListener('click', copyPixCodeToClipboard);
    }

    // Botão Gerar Novo Pix
    const btnRetry = document.getElementById('btn-retry-pix');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        resetPixDisplay();
        createPixCharge();
      });
    }
  }

  // Consulta CEP via servidor (/api/cep)
  async function fetchAddressByCEP(cleanCep) {
    const loading = document.getElementById('cep-loading-indicator');
    if (loading) loading.style.display = 'inline';

    try {
      const response = await fetch(`/api/cep?cep=${encodeURIComponent(cleanCep)}`);
      if (loading) loading.style.display = 'none';

      if (!response.ok) {
        showFieldError('address-cep', 'CEP não encontrado. Digite o endereço manualmente.');
        return;
      }

      const data = await response.json();
      if (data.street) {
        document.getElementById('input-address-street').value = data.street;
        clearFieldError('address-street');
      }
      if (data.neighborhood) {
        document.getElementById('input-address-neighborhood').value = data.neighborhood;
        clearFieldError('address-neighborhood');
      }
      if (data.city) {
        document.getElementById('input-address-city').value = data.city;
        clearFieldError('address-city');
      }
      if (data.state) {
        document.getElementById('input-address-state').value = data.state;
        clearFieldError('address-state');
      }

      // Foco automático no número após autopreenchimento
      const numInput = document.getElementById('input-address-number');
      if (numInput && !numInput.value) {
        numInput.focus();
      }
    } catch (err) {
      if (loading) loading.style.display = 'none';
    }
  }

  // Validação da Etapa 1
  function validateAndProceedStep1() {
    let isValid = true;
    let firstErrorEl = null;

    const name = (document.getElementById('input-customer-name').value || '').trim();
    if (name.length < 3 || name.length > 120) {
      showFieldError('customer-name', 'Informe seu nome completo (mínimo 3 caracteres).');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-customer-name');
    }

    const email = (document.getElementById('input-customer-email').value || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showFieldError('customer-email', 'Informe um e-mail válido (ex: seuemail@exemplo.com).');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-customer-email');
    }

    const phone = (document.getElementById('input-customer-phone').value || '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 11) {
      showFieldError('customer-phone', 'Telefone inválido. Informe DDD + número (ex: 11999999999).');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-customer-phone');
    }

    const cpf = (document.getElementById('input-customer-cpf').value || '').trim();
    if (!isValidCPF(cpf)) {
      showFieldError('customer-cpf', 'CPF inválido. Verifique os dígitos digitados.');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-customer-cpf');
    }

    if (!isValid) {
      if (firstErrorEl) firstErrorEl.focus();
      return;
    }

    // Salva dados validados
    customerData.name = name;
    customerData.email = email;
    customerData.phone = phone;
    customerData.cpf = cpf;

    // Atualiza resumo da etapa 1
    const nameEl = document.getElementById('collapsed-step-1-name');
    const subEl = document.getElementById('collapsed-step-1-sub');
    if (nameEl) nameEl.textContent = name;
    if (subEl) subEl.textContent = `${email} · ${maskPhone(phone)}`;

    goToStep(2);
  }

  function validateStep1Quietly() {
    const name = (document.getElementById('input-customer-name').value || '').trim();
    const email = (document.getElementById('input-customer-email').value || '').trim();
    const phone = (document.getElementById('input-customer-phone').value || '').replace(/\D/g, '');
    const cpf = (document.getElementById('input-customer-cpf').value || '').trim();
    return name.length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && phone.length >= 10 && isValidCPF(cpf);
  }

  // Validação da Etapa 2
  function validateAndProceedStep2() {
    let isValid = true;
    let firstErrorEl = null;

    const cep = (document.getElementById('input-address-cep').value || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      showFieldError('address-cep', 'Informe um CEP válido com 8 dígitos.');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-address-cep');
    }

    const street = (document.getElementById('input-address-street').value || '').trim();
    if (street.length < 2) {
      showFieldError('address-street', 'Informe o logradouro / rua.');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-address-street');
    }

    const number = (document.getElementById('input-address-number').value || '').trim();
    if (number.length < 1) {
      showFieldError('address-number', 'Informe o número do imóvel (ou S/N).');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-address-number');
    }

    const complement = (document.getElementById('input-address-complement').value || '').trim();

    const neighborhood = (document.getElementById('input-address-neighborhood').value || '').trim();
    if (neighborhood.length < 2) {
      showFieldError('address-neighborhood', 'Informe o bairro.');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-address-neighborhood');
    }

    const city = (document.getElementById('input-address-city').value || '').trim();
    if (city.length < 2) {
      showFieldError('address-city', 'Informe a cidade.');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-address-city');
    }

    const state = (document.getElementById('input-address-state').value || '').trim().toUpperCase();
    if (state.length !== 2) {
      showFieldError('address-state', 'Informe a UF do estado com 2 letras.');
      isValid = false;
      if (!firstErrorEl) firstErrorEl = document.getElementById('input-address-state');
    }

    if (!isValid) {
      if (firstErrorEl) firstErrorEl.focus();
      return;
    }

    customerData.cep = cep;
    customerData.street = street;
    customerData.number = number;
    customerData.complement = complement;
    customerData.neighborhood = neighborhood;
    customerData.city = city;
    customerData.state = state;

    // Atualiza resumo da etapa 2
    const stEl = document.getElementById('collapsed-step-2-street');
    const ctEl = document.getElementById('collapsed-step-2-city');
    if (stEl) stEl.textContent = `${street}, ${number}${complement ? ' (' + complement + ')' : ''}`;
    if (ctEl) ctEl.textContent = `${neighborhood} - ${city}/${state} · Frete Grátis`;

    goToStep(3);
  }

  function validateStep2Quietly() {
    const cep = (document.getElementById('input-address-cep').value || '').replace(/\D/g, '');
    const street = (document.getElementById('input-address-street').value || '').trim();
    const number = (document.getElementById('input-address-number').value || '').trim();
    const neighborhood = (document.getElementById('input-address-neighborhood').value || '').trim();
    const city = (document.getElementById('input-address-city').value || '').trim();
    const state = (document.getElementById('input-address-state').value || '').trim();
    return cep.length === 8 && street.length >= 2 && number.length >= 1 && neighborhood.length >= 2 && city.length >= 2 && state.length === 2;
  }

  // Transição de Etapas
  function goToStep(step) {
    currentStep = step;

    const nav1 = document.getElementById('step-nav-1');
    const nav2 = document.getElementById('step-nav-2');
    const nav3 = document.getElementById('step-nav-3');

    const form1 = document.getElementById('step-1-form-container');
    const summary1 = document.getElementById('step-1-collapsed-summary');

    const form2 = document.getElementById('step-2-form-container');
    const summary2 = document.getElementById('step-2-collapsed-summary');

    const content3 = document.getElementById('step-3-content-container');

    // Reset de classes na barra de progresso
    [nav1, nav2, nav3].forEach((n, idx) => {
      if (!n) return;
      n.classList.remove('active', 'completed');
      const circle = n.querySelector('.checkout-step-circle');
      if (circle) circle.textContent = (idx + 1).toString();
    });

    if (step === 1) {
      if (nav1) nav1.classList.add('active');
      if (form1) form1.style.display = 'block';
      if (summary1) summary1.style.display = 'none';

      if (form2) form2.style.display = 'none';
      if (summary2) summary2.style.display = 'none';

      if (content3) content3.style.display = 'none';

      // Auto-foco
      const firstInp = document.getElementById('input-customer-name');
      if (firstInp) firstInp.focus();
    } else if (step === 2) {
      if (nav1) {
        nav1.classList.add('completed');
        const c1 = nav1.querySelector('.checkout-step-circle');
        if (c1) c1.textContent = '✓';
      }
      if (nav2) nav2.classList.add('active');

      if (form1) form1.style.display = 'none';
      if (summary1) summary1.style.display = 'flex';

      if (form2) form2.style.display = 'block';
      if (summary2) summary2.style.display = 'none';

      if (content3) content3.style.display = 'none';

      const cepInp = document.getElementById('input-address-cep');
      if (cepInp) cepInp.focus();
    } else if (step === 3) {
      if (nav1) {
        nav1.classList.add('completed');
        const c1 = nav1.querySelector('.checkout-step-circle');
        if (c1) c1.textContent = '✓';
      }
      if (nav2) {
        nav2.classList.add('completed');
        const c2 = nav2.querySelector('.checkout-step-circle');
        if (c2) c2.textContent = '✓';
      }
      if (nav3) nav3.classList.add('active');

      if (form1) form1.style.display = 'none';
      if (summary1) summary1.style.display = 'flex';

      if (form2) form2.style.display = 'none';
      if (summary2) summary2.style.display = 'flex';

      if (content3) content3.style.display = 'block';
    }

    // Scroll suave para o topo do conteúdo do checkout
    const checkoutEl = document.getElementById('checkout-fullscreen-container');
    if (checkoutEl) {
      checkoutEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Helpers de Exibição de Erros
  function showFieldError(fieldKey, message) {
    const input = document.getElementById(`input-${fieldKey}`);
    const errorEl = document.getElementById(`error-${fieldKey}`);
    if (input) input.classList.add('error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  function clearFieldError(fieldKey) {
    const input = document.getElementById(`input-${fieldKey}`);
    const errorEl = document.getElementById(`error-${fieldKey}`);
    if (input) input.classList.remove('error');
    if (errorEl) {
      errorEl.classList.remove('visible');
    }
  }

  // Criação da cobrança Pix via API Serverless (/api/pix)
  async function createPixCharge() {
    if (isSubmittingPix) return;

    const errorDiv = document.getElementById('pix-general-error');
    if (errorDiv) {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }

    const btn = document.getElementById('btn-generate-pix');
    const btnText = document.getElementById('btn-generate-pix-text');
    if (btn) btn.disabled = true;
    if (btnText) {
      btnText.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;">
          <span style="width:16px;height:16px;border:2px solid #FFFFFF;border-top-color:transparent;border-radius:50%;display:inline-block;animation:checkout-spin 0.8s linear infinite;"></span>
          Gerando seu Pix...
        </span>
      `;
    }

    isSubmittingPix = true;

    try {
      const payload = {
        variantId: currentVariantId,
        customer: {
          name: customerData.name,
          email: customerData.email,
          document: customerData.cpf.replace(/\D/g, ''),
          phone: customerData.phone.replace(/\D/g, ''),
          address: {
            street: customerData.street,
            number: customerData.number,
            complement: customerData.complement,
            neighborhood: customerData.neighborhood,
            city: customerData.city,
            state: customerData.state,
            zip: customerData.cep.replace(/\D/g, '')
          }
        }
      };

      const response = await fetch('/api/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível gerar a cobrança Pix. Verifique os dados digitados.');
      }

      // Sucesso na criação do Pix
      activeTransactionId = data.id;
      renderPixDetails(data);
    } catch (err) {
      if (errorDiv) {
        errorDiv.textContent = err.message || 'Erro ao processar pagamento. Tente novamente.';
        errorDiv.style.display = 'block';
      }
    } finally {
      isSubmittingPix = false;
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = `Pagar ${PRICE_FORMATTED} com Pix`;
    }
  }

  // Renderiza detalhes do Pix gerado (QR Code, Código Copia e Cola, Timer e Polling)
  function renderPixDetails(pixData) {
    const preContainer = document.getElementById('pix-generation-pre-container');
    const activeDisplay = document.getElementById('pix-active-display-container');
    const qrImg = document.getElementById('pix-qr-img');
    const copyInput = document.getElementById('pix-copy-input');

    if (preContainer) preContainer.style.display = 'none';
    if (activeDisplay) activeDisplay.style.display = 'block';

    if (copyInput) {
      copyInput.value = pixData.copyPaste || '';
    }

    if (qrImg) {
      if (pixData.qrImage && pixData.qrImage.length > 5) {
        qrImg.src = pixData.qrImage;
      } else if (pixData.copyPaste) {
        // Fallback robusto usando API oficial do QR Server
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixData.copyPaste)}`;
      }
    }

    remainingSeconds = pixData.expiresInSeconds || 1800;
    startExpirationTimer();
    startStatusPolling(pixData.id);
  }

  // Copia o código Pix para a área de transferência
  function copyPixCodeToClipboard() {
    const input = document.getElementById('pix-copy-input');
    const feedback = document.getElementById('pix-copy-feedback');
    if (!input || !input.value) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(() => {
        showCopySuccess(feedback);
      }).catch(() => {
        fallbackCopy(input, feedback);
      });
    } else {
      fallbackCopy(input, feedback);
    }
  }

  function fallbackCopy(input, feedback) {
    input.focus();
    input.select();
    try {
      document.execCommand('copy');
      showCopySuccess(feedback);
    } catch (e) {}
  }

  function showCopySuccess(feedback) {
    if (!feedback) return;
    feedback.style.display = 'block';
    setTimeout(() => {
      feedback.style.display = 'none';
    }, 4000);
  }

  // Timer de 30 minutos
  function startExpirationTimer() {
    clearInterval(expirationTimerInterval);
    const display = document.getElementById('pix-timer-countdown');

    function update() {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      if (display) {
        display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }

      if (remainingSeconds <= 0) {
        clearInterval(expirationTimerInterval);
        clearInterval(statusPollInterval);
        handlePixExpired();
      } else {
        remainingSeconds--;
      }
    }

    update();
    expirationTimerInterval = setInterval(update, 1000);
  }

  // Polling de status a cada 4.5 segundos
  function startStatusPolling(transactionId) {
    clearInterval(statusPollInterval);
    if (!transactionId) return;

    statusPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?id=${encodeURIComponent(transactionId)}`);
        if (!res.ok) return;

        const data = await res.json();
        const status = (data.status || '').toLowerCase();

        if (status === 'paid' || status === 'approved' || status === 'completed') {
          clearInterval(statusPollInterval);
          clearInterval(expirationTimerInterval);
          handlePixPaid();
        } else if (status === 'expired') {
          clearInterval(statusPollInterval);
          clearInterval(expirationTimerInterval);
          handlePixExpired();
        } else if (status === 'refused' || status === 'failed' || status === 'canceled') {
          clearInterval(statusPollInterval);
          clearInterval(expirationTimerInterval);
          handlePixFailed();
        }
      } catch (e) {}
    }, 4500);
  }

  function handlePixPaid() {
    const statusBox = document.getElementById('pix-status-box');
    if (statusBox) {
      statusBox.style.background = '#DCFCE7';
      statusBox.style.borderColor = '#86EFAC';
      statusBox.innerHTML = `
        <div style="font-size:20px;">🎉</div>
        <div style="font-size:14px;font-weight:700;color:#166534;">
          Pagamento confirmado com sucesso!
          <div style="font-size:12px;font-weight:500;color:#15803D;margin-top:2px;">Seu pedido está sendo preparado para envio. Muito obrigado!</div>
        </div>
      `;
    }
  }

  function handlePixExpired() {
    const statusBox = document.getElementById('pix-status-box');
    const retryContainer = document.getElementById('btn-retry-pix');
    if (statusBox) {
      statusBox.style.background = '#FEF2F2';
      statusBox.style.borderColor = '#FCA5A5';
      statusBox.innerHTML = `
        <div style="font-size:18px;">⏰</div>
        <div style="font-size:13px;font-weight:700;color:#991B1B;">
          O código Pix expirou.
          <div style="font-size:11px;font-weight:500;color:#B91C1C;margin-top:2px;">Gere um novo código para concluir o pedido.</div>
        </div>
      `;
    }
    if (retryContainer) {
      retryContainer.parentElement.style.display = 'block';
    }
  }

  function handlePixFailed() {
    const statusBox = document.getElementById('pix-status-box');
    const retryContainer = document.getElementById('btn-retry-pix');
    if (statusBox) {
      statusBox.style.background = '#FEF2F2';
      statusBox.style.borderColor = '#FCA5A5';
      statusBox.innerHTML = `
        <div style="font-size:18px;">❌</div>
        <div style="font-size:13px;font-weight:700;color:#991B1B;">
          Pagamento não aprovado.
          <div style="font-size:11px;font-weight:500;color:#B91C1C;margin-top:2px;">Tente novamente gerando um novo Pix.</div>
        </div>
      `;
    }
    if (retryContainer) {
      retryContainer.parentElement.style.display = 'block';
    }
  }

  function resetPixDisplay() {
    clearInterval(statusPollInterval);
    clearInterval(expirationTimerInterval);
    const preContainer = document.getElementById('pix-generation-pre-container');
    const activeDisplay = document.getElementById('pix-active-display-container');
    const retryContainer = document.getElementById('btn-retry-pix');
    if (preContainer) preContainer.style.display = 'block';
    if (activeDisplay) activeDisplay.style.display = 'none';
    if (retryContainer) retryContainer.parentElement.style.display = 'none';
  }

  // Abertura e Fechamento do Checkout
  function openCheckout(variantId) {
    if (variantId && VARIANTS[variantId]) {
      currentVariantId = variantId;
    }
    updateSummaryDOM();

    const container = document.getElementById('checkout-fullscreen-container');
    if (!container) return;

    // Trava scroll da página de baixo
    document.body.style.overflow = 'hidden';

    // Gerenciamento de histórico para navegação nativa do navegador/celular
    if (window.location.hash !== '#checkout') {
      history.pushState({ checkout: true }, '', '#checkout');
    }

    container.classList.add('active');

    // Abre na primeira etapa vazia ou etapa 1
    goToStep(currentStep || 1);
  }

  function closeCheckout(force = false) {
    const container = document.getElementById('checkout-fullscreen-container');
    if (!container || !container.classList.contains('active')) return;

    // Confirmação caso haja dados preenchidos
    const hasData = Object.values(customerData).some(v => typeof v === 'string' && v.trim().length > 0);
    if (!force && hasData) {
      const confirmLeave = window.confirm('Deseja realmente voltar à loja? Seus dados preenchidos serão perdidos.');
      if (!confirmLeave) return;
    }

    // Libera scroll da página de baixo
    document.body.style.overflow = '';

    container.classList.remove('active');

    // Remove hash da URL se estiver presente
    if (window.location.hash === '#checkout') {
      history.back();
    }

    // Para timers
    clearInterval(statusPollInterval);
    clearInterval(expirationTimerInterval);
  }

  // Tratamento de URL Hash e Botão Voltar do Navegador
  function handleInitialUrlHash() {
    if (window.location.hash === '#checkout') {
      const buyBtn = document.getElementById('bottom-buy-btn');
      const vid = buyBtn ? (buyBtn.dataset.variantId || 'modelo-2') : 'modelo-2';
      openCheckout(vid);
    }
  }

  function setupHistoryHandling() {
    window.addEventListener('popstate', (e) => {
      const container = document.getElementById('checkout-fullscreen-container');
      if (container && container.classList.contains('active')) {
        // Se o usuário clicou em Voltar no navegador/celular e saiu de #checkout
        if (window.location.hash !== '#checkout') {
          closeCheckout(true);
        }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const container = document.getElementById('checkout-fullscreen-container');
        if (container && container.classList.contains('active')) {
          closeCheckout();
        }
      }
    });
  }

  // Exposição global para integração opcional
  window.InvictusCheckout = {
    open: openCheckout,
    close: closeCheckout,
    goToStep: goToStep
  };

})();
