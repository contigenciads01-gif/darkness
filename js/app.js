// Interactive controller for Tablet 17 Pro Max landing page

(function() {
  // 1. Product Variants data & checkout links
  const VARIANTS = [
    {
      id: 'modelo-1',
      label: 'Cinza',
      imageIndex: 1,
      stockKind: 'low',
      stockLabel: 'Últimas 3 peças',
      checkoutUrl: 'https://seguro.veromix.shop/api/public/shopify?product=2788527241455&store=27885'
    },
    {
      id: 'modelo-2',
      label: 'Azul',
      imageIndex: 2,
      stockKind: 'low',
      stockLabel: 'Últimas 5 peças',
      checkoutUrl: 'https://seguro.veromix.shop/api/public/shopify?product=2788514257293&store=27885'
    },
    {
      id: 'modelo-3',
      label: 'Laranja',
      imageIndex: 3,
      stockKind: 'low',
      stockLabel: 'Últimas 2 peças',
      checkoutUrl: 'https://seguro.tiktobrasil.shop/api/public/shopify?product=2788532695826&store=27885'
    },
    {
      id: 'modelo-preto',
      label: 'Preto',
      imageIndex: 4,
      stockKind: 'low',
      stockLabel: 'Últimas 3 peças',
      checkoutUrl: 'https://seguro.veromix.shop/api/public/shopify?product=2788538876135&store=27885'
    },
    {
      id: 'modelo-rosa',
      label: 'Rosa',
      imageIndex: 5,
      stockKind: 'low',
      stockLabel: 'Últimas 7 peças',
      checkoutUrl: 'https://seguro.veromix.shop/api/public/shopify?product=2788595268685&store=27885'
    }
  ];

  // Helper to append current UTM parameters to checkout URLs
  const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid', 'tbclid'];
  function buildCheckoutUrl(baseUrl) {
    try {
      const url = new URL(baseUrl);
      const currentParams = new URLSearchParams(window.location.search);
      UTM_PARAMS.forEach(key => {
        const val = currentParams.get(key);
        if (val) url.searchParams.set(key, val);
      });
      return url.toString();
    } catch (e) {
      return baseUrl;
    }
  }

  // Toast notification helper
  function showToast(msg) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notification';
      toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-stone-900/90 text-white text-xs font-semibold shadow-lg transition-all duration-300 pointer-events-none opacity-0 -translate-y-2';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('opacity-0', '-translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', '-translate-y-2');
    }, 2800);
  }

  document.addEventListener('DOMContentLoaded', initPage);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initPage();
  }

  function initPage() {
    if (window._pageInitialized) return;
    window._pageInitialized = true;

    initGalleryVideo();
    initGalleryScroll();
    initVariantSelection();
    initCountdown();
    initDeliveryDate();
    initDescriptionToggle();
    initReviewVideos();
  }

  // 1. Gallery Video (Autoplay + Mute/Unmute toggle)
  function initGalleryVideo() {
    const video = document.getElementById('hero-gallery-video');
    const muteBtn = document.getElementById('hero-mute-btn');
    if (!video || !muteBtn) return;

    // Ensure initial playback with muted (browser policy compliant)
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy prevented playback, attempt again on first user interaction
        const resumePlay = () => {
          video.play().catch(() => {});
          window.removeEventListener('click', resumePlay);
          window.removeEventListener('touchstart', resumePlay);
        };
        window.addEventListener('click', resumePlay, { once: true });
        window.addEventListener('touchstart', resumePlay, { once: true });
      });
    }

    const soundOnSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-2"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path></svg>`;
    const soundOffSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-x"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><line x1="22" x2="16" y1="9" y2="15"></line><line x1="16" x2="22" y2="15"></line></svg>`;

    function updateMuteButtonState() {
      if (video.muted) {
        muteBtn.innerHTML = soundOffSvg;
        muteBtn.setAttribute('aria-label', 'Ativar som');
        muteBtn.setAttribute('title', 'Ativar som');
      } else {
        muteBtn.innerHTML = soundOnSvg;
        muteBtn.setAttribute('aria-label', 'Desligar som');
        muteBtn.setAttribute('title', 'Desligar som');
      }
    }

    updateMuteButtonState();

    function toggleMute(e) {
      if (e) e.stopPropagation();
      video.muted = !video.muted;
      if (!video.muted) {
        video.volume = 1;
        video.play().catch(() => {});
        showToast('🔊 Som ativado');
        // Pause any review videos currently playing
        pauseReviewVideos();
      } else {
        showToast('🔇 Som desativado');
      }
      updateMuteButtonState();
    }

    muteBtn.addEventListener('click', toggleMute);

    // Clicking on video toggles sound
    video.parentElement.addEventListener('click', function(e) {
      if (e.target.closest('#hero-mute-btn')) return;
      toggleMute();
    });
  }

  // 2. Carousel scroll counter (1/14 ... 14/14)
  function initGalleryScroll() {
    const gallery = document.getElementById('product-gallery');
    const counter = document.getElementById('gallery-counter');
    if (!gallery || !counter) return;

    let ticking = false;
    gallery.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const width = gallery.clientWidth || 1;
          const index = Math.round(gallery.scrollLeft / width);
          const total = gallery.children.length;
          counter.textContent = `${Math.min(Math.max(index + 1, 1), total)}/${total}`;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // 3. Variant Selection
  function initVariantSelection() {
    const variantBtns = document.querySelectorAll('button[data-variant-id]');
    const buyBtn = document.getElementById('bottom-buy-btn');
    const buySub = document.getElementById('bottom-buy-subtitle');
    const gallery = document.getElementById('product-gallery');

    let currentSelected = VARIANTS.find(v => v.id === 'modelo-2') || VARIANTS[1]; // Azul default

    function selectVariant(variant) {
      if (variant.stockKind === 'esgotado') {
        showToast(`⚠️ Cor ${variant.label} esgotada! Escolha Azul, Preto ou Rosa.`);
        return;
      }

      currentSelected = variant;

      // Update button styling
      variantBtns.forEach(btn => {
        const id = btn.getAttribute('data-variant-id');
        if (id === variant.id) {
          btn.setAttribute('aria-pressed', 'true');
          btn.classList.add('border-primary', 'ring-1', 'ring-primary');
          btn.classList.remove('border-border');
        } else {
          btn.setAttribute('aria-pressed', 'false');
          btn.classList.remove('border-primary', 'ring-1', 'ring-primary');
          btn.classList.add('border-border');
        }
      });

      // Update bottom checkout bar
      if (buyBtn) {
        buyBtn.href = buildCheckoutUrl(variant.checkoutUrl);
        buyBtn.dataset.variantId = variant.id;
      }
      if (buySub) {
        buySub.textContent = `${variant.label} · R$ 297,00 · Frete grátis`;
      }

      // Scroll gallery to selected tablet image
      if (gallery && typeof variant.imageIndex === 'number') {
        const targetSlide = gallery.children[variant.imageIndex];
        if (targetSlide) {
          targetSlide.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }
    }

    variantBtns.forEach(btn => {
      const vid = btn.getAttribute('data-variant-id');
      const vData = VARIANTS.find(v => v.id === vid);
      if (!vData) return;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        selectVariant(vData);
      });
    });

    // Set initial link and dataset
    if (buyBtn && currentSelected) {
      buyBtn.href = buildCheckoutUrl(currentSelected.checkoutUrl);
      buyBtn.dataset.variantId = currentSelected.id;
    }
  }

  // 4. Countdown Timer
  function initCountdown() {
    const timerEl = document.getElementById('countdown-timer');
    if (!timerEl) return;

    let seconds = 3420; // 57 min
    const savedTime = sessionStorage.getItem('promo_timer_remaining');
    const savedTimestamp = sessionStorage.getItem('promo_timer_timestamp');
    if (savedTime && savedTimestamp) {
      const elapsed = Math.floor((Date.now() - parseInt(savedTimestamp, 10)) / 1000);
      seconds = Math.max(0, parseInt(savedTime, 10) - elapsed);
      if (seconds === 0) seconds = 3420;
    }

    function render() {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      const mm = String(m).padStart(2, '0');
      const ss = String(s).padStart(2, '0');
      timerEl.textContent = `00:${mm}:${ss}`;
      sessionStorage.setItem('promo_timer_remaining', seconds);
      sessionStorage.setItem('promo_timer_timestamp', Date.now());
    }

    render();
    setInterval(() => {
      if (seconds > 0) {
        seconds--;
      } else {
        seconds = 3420;
      }
      render();
    }, 1000);
  }

  // 5. Dynamic Delivery Date
  function initDeliveryDate() {
    const deliveryEl = document.getElementById('delivery-date-text');
    if (!deliveryEl) return;

    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const formatDate = d => `${d.getDate()} de ${months[d.getMonth()]}`;

    const now = Date.now();
    const d1 = new Date(now + 5 * 86400000);
    const d2 = new Date(now + 8 * 86400000);

    deliveryEl.innerHTML = `Receba até <strong>${formatDate(d1)} - ${formatDate(d2)}</strong>`;
  }

  // 6. Description Expand / Collapse ("Ver mais")
  function initDescriptionToggle() {
    const descContent = document.getElementById('description-content');
    const descOverlay = document.getElementById('description-overlay');
    const descBtn = document.getElementById('description-toggle-btn');
    if (!descContent || !descBtn) return;

    let expanded = false;
    descBtn.addEventListener('click', () => {
      expanded = !expanded;
      if (expanded) {
        descContent.classList.remove('max-h-72');
        if (descOverlay) descOverlay.classList.add('hidden');
        descBtn.textContent = 'Ver menos';
      } else {
        descContent.classList.add('max-h-72');
        if (descOverlay) descOverlay.classList.remove('hidden');
        descBtn.textContent = 'Ver mais';
        descContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // 7. Review Videos coordination
  let reviewVideos = [];
  function pauseReviewVideos() {
    reviewVideos.forEach(v => {
      if (!v.paused) v.pause();
    });
  }

  function initReviewVideos() {
    const heroVideo = document.getElementById('hero-gallery-video');
    reviewVideos = Array.from(document.querySelectorAll('.review-video'));

    reviewVideos.forEach(vid => {
      vid.addEventListener('play', () => {
        // Pause other review videos
        reviewVideos.forEach(other => {
          if (other !== vid && !other.paused) {
            other.pause();
          }
        });
        // Mute top hero video so sounds don't overlap
        if (heroVideo && !heroVideo.muted) {
          heroVideo.muted = true;
          const muteBtn = document.getElementById('hero-mute-btn');
          if (muteBtn) {
            muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-x"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><line x1="22" x2="16" y1="9" y2="15"></line><line x1="16" x2="22" y2="15"></line></svg>`;
            muteBtn.setAttribute('aria-label', 'Ativar som');
            muteBtn.setAttribute('title', 'Ativar som');
          }
        }
      });
    });
  }
})();
