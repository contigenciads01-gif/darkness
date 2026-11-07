/**
 * Checkout Pix Integrado - InvictusPay
 * Gerencia o modal, máscaras de formulário, criação da cobrança e consulta de status.
 */

(function() {
  'use strict';

  // Variáveis de controle de polling e timer
  let statusPollInterval = null;
  let expirationTimerInterval = null;
  let remainingSeconds = 1800;
  let activeTransactionId = null;

  // Variantes e nomes amigáveis para exibição
  const VARIANT_NAMES = {
    'modelo-1': 'Cinza',
    'modelo-2': 'Azul',
    'modelo-3': 'Laranja',
    'modelo-preto': 'Preto',
    'modelo-rosa': 'Rosa'
  };

  // Máscaras de entrada
  function maskCPF(value) {
    return value
      .replace(/\D/g, '')
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function maskPhone(value) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    }
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  }

  // Inicialização quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPixCheckout);
  } else {
    initPixCheckout();
  }

  function initPixCheckout() {
    const buyBtn = document.getElementById('bottom-buy-btn');
    if (!buyBtn) return;

    // Garante que o dataset inicial esteja configurado
    if (!buyBtn.dataset.variantId) {
      buyBtn.dataset.variantId = 'modelo-2';
    }

    // Intercepta o clique no botão "Comprar agora"
    buyBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const variantId = buyBtn.dataset.variantId || 'modelo-2';
      openPixModal(variantId);
    });

    createModalDOM();
  }

  // Criação dos elementos do modal no DOM
  function createModalDOM() {
    if (document.getElementById('pix-checkout-modal')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'pix-checkout-modal';
    modalOverlay.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 opacity-0 pointer-events-none';
    modalOverlay.setAttribute('role', 'dialog');
    modalOverlay.setAttribute('aria-modal', 'true');
    modalOverlay.setAttribute('aria-labelledby', 'pix-modal-title');

    modalOverlay.innerHTML = `
      <div id="pix-modal-content" class="relative w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-background border border-border p-5 shadow-2xl transition-transform duration-300 transform translate-y-8">
        
        <!-- Botão Fechar -->
        <button id="pix-close-btn" type="button" class="absolute top-4 right-4 inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted/60 text-foreground hover:bg-muted transition-colors cursor-pointer" aria-label="Fechar modal">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
        </button>

        <!-- ETAPA 1: FORMULÁRIO DE DADOS DO CLIENTE -->
        <div id="pix-step-form">
          <div class="border-b border-border pb-3 mb-4 pr-8">
            <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg> Pagamento via Pix
            </span>
            <h2 id="pix-modal-title" class="text-base font-bold text-foreground mt-1.5">Finalizar Pedido</h2>
            <p id="pix-product-summary" class="text-xs text-muted-foreground mt-0.5"></p>
          </div>

          <!-- Mensagem de erro inline -->
          <div id="pix-form-error" class="hidden mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium"></div>

          <form id="pix-customer-form" novalidate>
            <div class="space-y-3">
              <div>
                <label for="pix-input-name" class="block text-xs font-semibold text-foreground mb-1">Nome Completo *</label>
                <input type="text" id="pix-input-name" required placeholder="Seu nome completo" class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              </div>

              <div>
                <label for="pix-input-cpf" class="block text-xs font-semibold text-foreground mb-1">CPF *</label>
                <input type="text" id="pix-input-cpf" required inputmode="numeric" placeholder="000.000.000-00" class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              </div>

              <div>
                <label for="pix-input-email" class="block text-xs font-semibold text-foreground mb-1">E-mail *</label>
                <input type="email" id="pix-input-email" required placeholder="seuemail@exemplo.com" class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              </div>

              <div>
                <label for="pix-input-phone" class="block text-xs font-semibold text-foreground mb-1">Celular / WhatsApp *</label>
                <input type="tel" id="pix-input-phone" required inputmode="numeric" placeholder="(00) 00000-0000" class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary">
              </div>
            </div>

            <div class="mt-5">
              <button id="pix-submit-btn" type="submit" class="w-full rounded-full bg-gradient-copper py-3 text-center text-sm font-bold text-primary-foreground shadow-md transition-all hover:brightness-105 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
                Gerar Pix de R$ 297,00
              </button>
            </div>

            <p class="mt-3 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
              Ambiente 100% Criptografado e Seguro
            </p>
          </form>
        </div>

        <!-- ETAPA 2: EXIBIÇÃO DO QR CODE E COPIA E COLA -->
        <div id="pix-step-payment" class="hidden">
          <div class="text-center pb-3 border-b border-border pr-6">
            <span class="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              Pix gerado com sucesso!
            </span>
            <h3 class="text-base font-bold text-foreground mt-1">Pague R$ 297,00</h3>
            <p id="pix-timer-text" class="text-xs text-muted-foreground mt-0.5 font-medium">Expira em: <span id="pix-countdown-display" class="font-bold text-foreground font-mono">30:00</span></p>
          </div>

          <!-- QR Code Container -->
          <div id="pix-qr-container" class="mt-4 text-center">
            <div class="inline-block p-2 rounded-xl bg-white border border-border shadow-sm">
              <img id="pix-qr-image" src="" alt="QR Code Pix" class="w-44 h-44 object-contain mx-auto" />
            </div>
            <p class="text-xs text-muted-foreground mt-2">Escaneie o QR Code com o aplicativo do seu banco</p>
          </div>

          <!-- Código Copia e Cola -->
          <div class="mt-4">
            <label for="pix-copypaste-input" class="block text-xs font-semibold text-foreground mb-1">Ou pague via Pix Copia e Cola:</label>
            <div class="relative">
              <input id="pix-copypaste-input" type="text" readonly class="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground truncate select-all pr-24" />
              <button id="pix-copy-action-btn" type="button" class="absolute right-1 top-1 bottom-1 px-3 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors cursor-pointer">
                Copiar
              </button>
            </div>
            <div id="pix-copy-feedback" class="hidden mt-1.5 text-center text-xs font-semibold text-accent">
              ✓ Código Pix copiado com sucesso!
            </div>
          </div>

          <!-- Status dinâmico da transação -->
          <div id="pix-status-banner" class="mt-5 p-3 rounded-xl bg-muted/50 border border-border flex items-center justify-center gap-2.5">
            <div id="pix-status-spinner" class="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            <span id="pix-status-message" class="text-xs font-semibold text-foreground">Aguardando confirmação do pagamento...</span>
          </div>

          <!-- Botão para gerar novo Pix em caso de expiração/erro -->
          <div id="pix-restart-container" class="hidden mt-4">
            <button id="pix-restart-btn" type="button" class="w-full rounded-full border border-primary text-primary py-2.5 text-xs font-bold hover:bg-primary/5 transition-colors cursor-pointer">
              Gerar novo Pix
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Eventos de fechamento
    const closeBtn = document.getElementById('pix-close-btn');
    closeBtn.addEventListener('click', closePixModal);

    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        closePixModal();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modalOverlay.classList.contains('opacity-100')) {
        closePixModal();
      }
    });

    // Máscaras de digitação
    const cpfInput = document.getElementById('pix-input-cpf');
    cpfInput.addEventListener('input', function() {
      this.value = maskCPF(this.value);
    });

    const phoneInput = document.getElementById('pix-input-phone');
    phoneInput.addEventListener('input', function() {
      this.value = maskPhone(this.value);
    });

    // Envio do formulário
    const form = document.getElementById('pix-customer-form');
    form.addEventListener('submit', handleFormSubmit);

    // Botão de copiar código Pix
    const copyBtn = document.getElementById('pix-copy-action-btn');
    copyBtn.addEventListener('click', handleCopyCode);

    // Botão de reiniciar/gerar novo Pix
    const restartBtn = document.getElementById('pix-restart-btn');
    restartBtn.addEventListener('click', function() {
      resetModalToForm();
    });
  }

  // Abrir modal
  function openPixModal(variantId) {
    const modal = document.getElementById('pix-checkout-modal');
    const content = document.getElementById('pix-modal-content');
    const summary = document.getElementById('pix-product-summary');
    if (!modal || !content) return;

    modal.dataset.variantId = variantId;

    const colorName = VARIANT_NAMES[variantId] || 'Azul';
    if (summary) {
      summary.textContent = `Tablet 17 Pro Max 2 em 1 (${colorName}) · R$ 297,00 · Frete grátis`;
    }

    resetModalToForm();

    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100');
    content.classList.remove('translate-y-8');
    content.classList.add('translate-y-0');

    // Foco no primeiro campo
    setTimeout(() => {
      const nameInput = document.getElementById('pix-input-name');
      if (nameInput) nameInput.focus();
    }, 150);
  }

  // Fechar modal
  function closePixModal() {
    const modal = document.getElementById('pix-checkout-modal');
    const content = document.getElementById('pix-modal-content');
    if (!modal || !content) return;

    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.remove('translate-y-0');
    content.classList.add('translate-y-8');

    stopPolling();
    stopExpirationTimer();
  }

  function resetModalToForm() {
    stopPolling();
    stopExpirationTimer();

    const formStep = document.getElementById('pix-step-form');
    const paymentStep = document.getElementById('pix-step-payment');
    const errorBox = document.getElementById('pix-form-error');
    const submitBtn = document.getElementById('pix-submit-btn');

    if (formStep) formStep.classList.remove('hidden');
    if (paymentStep) paymentStep.classList.add('hidden');
    if (errorBox) {
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gerar Pix de R$ 297,00';
    }
  }

  // Envio dos dados para criar cobrança
  async function handleFormSubmit(e) {
    e.preventDefault();

    const modal = document.getElementById('pix-checkout-modal');
    const variantId = modal.dataset.variantId || 'modelo-2';

    const nameInput = document.getElementById('pix-input-name');
    const cpfInput = document.getElementById('pix-input-cpf');
    const emailInput = document.getElementById('pix-input-email');
    const phoneInput = document.getElementById('pix-input-phone');
    const submitBtn = document.getElementById('pix-submit-btn');
    const errorBox = document.getElementById('pix-form-error');

    errorBox.classList.add('hidden');
    errorBox.textContent = '';

    const customer = {
      name: nameInput.value.trim(),
      document: cpfInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim()
    };

    // Validações básicas de preenchimento
    if (!customer.name || customer.name.length < 3) {
      showFormError('Por favor, informe seu nome completo.');
      nameInput.focus();
      return;
    }

    const cleanCpf = customer.document.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      showFormError('Por favor, informe um CPF válido com 11 dígitos.');
      cpfInput.focus();
      return;
    }

    if (!customer.email || !customer.email.includes('@')) {
      showFormError('Por favor, informe um e-mail válido.');
      emailInput.focus();
      return;
    }

    const cleanPhone = customer.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      showFormError('Por favor, informe um telefone com DDD.');
      phoneInput.focus();
      return;
    }

    // Estado de loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Gerando seu Pix...';

    try {
      const response = await fetch('/api/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          variantId,
          customer
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível gerar o Pix agora. Tente novamente.');
      }

      // Exibe a tela de pagamento do Pix
      showPaymentStep(data);
    } catch (err) {
      showFormError(err.message || 'Erro de conexão ao gerar o Pix. Verifique sua internet.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gerar Pix de R$ 297,00';
    }
  }

  function showFormError(msg) {
    const errorBox = document.getElementById('pix-form-error');
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  // Exibe a etapa do QR Code e Copia e Cola
  function showPaymentStep(data) {
    const formStep = document.getElementById('pix-step-form');
    const paymentStep = document.getElementById('pix-step-payment');
    const qrContainer = document.getElementById('pix-qr-container');
    const qrImage = document.getElementById('pix-qr-image');
    const copypasteInput = document.getElementById('pix-copypaste-input');
    const statusMessage = document.getElementById('pix-status-message');
    const statusSpinner = document.getElementById('pix-status-spinner');
    const restartContainer = document.getElementById('pix-restart-container');

    formStep.classList.add('hidden');
    paymentStep.classList.remove('hidden');

    activeTransactionId = data.id;

    // Configura o código copia e cola
    const code = data.copyPaste || '';
    copypasteInput.value = code;

    // Configura imagem do QR Code
    if (data.qrImage) {
      let qrSrc = data.qrImage;
      if (!qrSrc.startsWith('http') && !qrSrc.startsWith('data:')) {
        qrSrc = `data:image/png;base64,${qrSrc}`;
      }
      qrImage.src = qrSrc;
      qrContainer.classList.remove('hidden');
    } else {
      qrContainer.classList.add('hidden');
    }

    // Configura o status inicial
    statusSpinner.classList.remove('hidden');
    statusMessage.textContent = 'Aguardando pagamento...';
    restartContainer.classList.add('hidden');

    // Inicia cronômetro regressivo
    remainingSeconds = Number(data.expiresInSeconds) || 1800;
    startExpirationTimer();

    // Inicia polling de status
    startPolling(data.id);
  }

  // Copiar código Pix
  function handleCopyCode() {
    const input = document.getElementById('pix-copypaste-input');
    const feedback = document.getElementById('pix-copy-feedback');
    const copyBtn = document.getElementById('pix-copy-action-btn');
    if (!input || !input.value) return;

    const textToCopy = input.value;

    function onCopied() {
      feedback.classList.remove('hidden');
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => {
        feedback.classList.add('hidden');
        copyBtn.textContent = 'Copiar';
      }, 3000);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(onCopied).catch(() => {
        fallbackCopy();
      });
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      input.focus();
      input.select();
      try {
        document.execCommand('copy');
        onCopied();
      } catch (err) {
        alert('Selecione e copie o código manualmente.');
      }
    }
  }

  // Cronômetro do Pix
  function startExpirationTimer() {
    stopExpirationTimer();
    updateTimerDisplay();

    expirationTimerInterval = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        stopExpirationTimer();
        handlePixExpired();
      } else {
        updateTimerDisplay();
      }
    }, 1000);
  }

  function stopExpirationTimer() {
    if (expirationTimerInterval) {
      clearInterval(expirationTimerInterval);
      expirationTimerInterval = null;
    }
  }

  function updateTimerDisplay() {
    const display = document.getElementById('pix-countdown-display');
    if (!display) return;
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Polling de status a cada 4.5 segundos
  function startPolling(txId) {
    stopPolling();
    if (!txId) return;

    let pollIntervalMs = 4500;
    const maxEndTime = Date.now() + 31 * 60 * 1000; // Máximo 31 min

    async function poll() {
      if (Date.now() > maxEndTime) {
        stopPolling();
        handlePixExpired();
        return;
      }

      try {
        const res = await fetch(`/api/status?id=${encodeURIComponent(txId)}`);
        
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
          statusPollInterval = setTimeout(poll, retryAfter * 1000);
          return;
        }

        if (res.ok) {
          const json = await res.json();
          const status = json.status;
          handleStatusChange(status);
        } else {
          // Continua tentando se for erro passageiro
          statusPollInterval = setTimeout(poll, pollIntervalMs);
        }
      } catch (e) {
        statusPollInterval = setTimeout(poll, pollIntervalMs);
      }
    }

    // Inicia primeira consulta após intervalo
    statusPollInterval = setTimeout(poll, pollIntervalMs);
  }

  function stopPolling() {
    if (statusPollInterval) {
      clearTimeout(statusPollInterval);
      statusPollInterval = null;
    }
  }

  // Tratamento dos status conforme especificação
  function handleStatusChange(status) {
    const messageEl = document.getElementById('pix-status-message');
    const spinner = document.getElementById('pix-status-spinner');
    const restartContainer = document.getElementById('pix-restart-container');
    const banner = document.getElementById('pix-status-banner');

    if (status === 'paid') {
      stopPolling();
      stopExpirationTimer();
      spinner.classList.add('hidden');
      banner.className = 'mt-5 p-3.5 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center gap-2.5 text-accent';
      messageEl.textContent = 'Pagamento confirmado! Obrigado pela compra.';
    } else if (status === 'expired') {
      handlePixExpired();
    } else if (status === 'cancelled' || status === 'refused' || status === 'failed') {
      stopPolling();
      stopExpirationTimer();
      spinner.classList.add('hidden');
      banner.className = 'mt-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center gap-2 text-destructive';
      messageEl.textContent = 'Pagamento não concluído ou recusado.';
      restartContainer.classList.remove('hidden');
    } else {
      // pending / processing / antifraud
      messageEl.textContent = 'Aguardando pagamento...';
      statusPollInterval = setTimeout(() => {
        if (activeTransactionId) {
          fetch(`/api/status?id=${encodeURIComponent(activeTransactionId)}`)
            .then(r => r.json())
            .then(j => handleStatusChange(j.status))
            .catch(() => {});
        }
      }, 4500);
    }
  }

  function handlePixExpired() {
    stopPolling();
    stopExpirationTimer();
    const messageEl = document.getElementById('pix-status-message');
    const spinner = document.getElementById('pix-status-spinner');
    const restartContainer = document.getElementById('pix-restart-container');
    const banner = document.getElementById('pix-status-banner');

    if (spinner) spinner.classList.add('hidden');
    if (banner) {
      banner.className = 'mt-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center gap-2 text-destructive';
    }
    if (messageEl) {
      messageEl.textContent = 'O Pix expirou. Gere um novo para continuar.';
    }
    if (restartContainer) {
      restartContainer.classList.remove('hidden');
    }
  }

})();
