/**
 * SpeechT5 LJSpeech Studio - Frontend Controller
 * Handles UI interactions, API calls, AudioContext visualizer, and playback.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const systemBadge = document.getElementById('systemBadge');
  const systemStatusText = document.getElementById('systemStatusText');

  // Tabs
  const navStudioBtn = document.getElementById('navStudioBtn');
  const navInsightsBtn = document.getElementById('navInsightsBtn');
  const studioTab = document.getElementById('studioTab');
  const insightsTab = document.getElementById('insightsTab');

  // Input & Controls
  const ttsTextInput = document.getElementById('ttsTextInput');
  const charCounter = document.getElementById('charCounter');
  const clearTextBtn = document.getElementById('clearTextBtn');
  const voicePresetsContainer = document.getElementById('voicePresetsContainer');
  const accordionToggle = document.getElementById('accordionToggle');
  const advancedAccordion = document.getElementById('advancedAccordion');
  const customSeedInput = document.getElementById('customSeedInput');
  const randomSeedBtn = document.getElementById('randomSeedBtn');
  const speedSlider = document.getElementById('speedSlider');
  const speedValueDisplay = document.getElementById('speedValueDisplay');
  const synthesizeBtn = document.getElementById('synthesizeBtn');
  const synthIcon = document.getElementById('synthIcon');
  const synthText = document.getElementById('synthText');
  const synthLoader = document.getElementById('synthLoader');

  // Player & Visualizer
  const nativeAudio = document.getElementById('nativeAudio');
  const waveformCanvas = document.getElementById('waveformCanvas');
  const canvasIdleOverlay = document.getElementById('canvasIdleOverlay');
  const audioMetaBadge = document.getElementById('audioMetaBadge');
  const currentTimeDisplay = document.getElementById('currentTimeDisplay');
  const totalDurationDisplay = document.getElementById('totalDurationDisplay');
  const progressBarWrapper = document.getElementById('progressBarWrapper');
  const progressBar = document.getElementById('progressBar');
  const mainPlayBtn = document.getElementById('mainPlayBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const replayBtn = document.getElementById('replayBtn');
  const muteBtn = document.getElementById('muteBtn');
  const volHighIcon = document.getElementById('volHighIcon');
  const volMuteIcon = document.getElementById('volMuteIcon');
  const playbackRateBtn = document.getElementById('playbackRateBtn');
  const downloadWavBtn = document.getElementById('downloadWavBtn');

  // Stats Bar
  const generationStatsBar = document.getElementById('generationStatsBar');
  const statGenTime = document.getElementById('statGenTime');
  const statDuration = document.getElementById('statDuration');
  const statRtf = document.getElementById('statRtf');

  // History
  const historyList = document.getElementById('historyList');
  const emptyHistoryMsg = document.getElementById('emptyHistoryMsg');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Modal
  const imageModal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  const modalTitle = document.getElementById('modalTitle');
  const closeModalBtn = document.getElementById('closeModalBtn');

  // Hamburger & Layout Controls
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const studioGrid = document.getElementById('studioGrid');
  const playerCard = document.querySelector('.player-card');
  const inputCard = document.querySelector('.input-card');
  const expandPlayerBtn = document.getElementById('expandPlayerBtn');
  const expandIcon = document.getElementById('expandIcon');
  const compressIcon = document.getElementById('compressIcon');
  const collapsedSidebarBar = document.getElementById('collapsedSidebarBar');
  const collapsedMeta = document.getElementById('collapsedMeta');
  const collapsedSynthBtn = document.getElementById('collapsedSynthBtn');

  // --- App State ---
  let voicePresets = [];
  let selectedPreset = 'ljspeech_default';
  let isGenerating = false;
  let historyItems = [];
  let currentEnvelope = [];
  let sidebarHidden = false;
  let playerExpanded = false;

  // Web Audio API visualizer state
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let animFrameId = null;
  const canvasCtx = waveformCanvas.getContext('2d');

  // --- Initialization ---
  init();

  async function init() {
    setupEventListeners();
    updateCharCounter();
    drawIdleVisualizer();
    await checkHealth();
    await loadVoices();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Navigation Tabs
    navStudioBtn.addEventListener('click', () => switchTab('studio'));
    navInsightsBtn.addEventListener('click', () => switchTab('insights'));

    // Textarea & Counter
    ttsTextInput.addEventListener('input', updateCharCounter);
    clearTextBtn.addEventListener('click', () => {
      ttsTextInput.value = '';
      updateCharCounter();
      ttsTextInput.focus();
    });

    // Preset Prompt Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        ttsTextInput.value = chip.getAttribute('data-prompt');
        updateCharCounter();
        ttsTextInput.focus();
      });
    });

    // Accordion
    accordionToggle.addEventListener('click', () => {
      advancedAccordion.classList.toggle('open');
    });

    // Random Seed Generator
    randomSeedBtn.addEventListener('click', () => {
      const randSeed = Math.floor(Math.random() * 99999) + 1;
      customSeedInput.value = randSeed;
      // Auto-select custom voice card
      selectVoiceCard('custom');
    });

    // Speed Slider
    speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value).toFixed(2);
      speedValueDisplay.textContent = `${val}x`;
    });

    // Synthesize Button
    synthesizeBtn.addEventListener('click', handleSynthesize);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      const isTyping = active === ttsTextInput || active === customSeedInput || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSynthesize();
      } else if (e.code === 'Space' && !isTyping) {
        if (!mainPlayBtn.disabled) {
          e.preventDefault();
          togglePlayPause();
        }
      } else if (e.key === 'h' && !isTyping) {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === 'e' && !isTyping) {
        e.preventDefault();
        toggleExpandPlayer();
      }
    });

    // Native Audio Events
    nativeAudio.addEventListener('loadedmetadata', onAudioLoaded);
    nativeAudio.addEventListener('timeupdate', onAudioTimeUpdate);
    nativeAudio.addEventListener('ended', onAudioEnded);
    nativeAudio.addEventListener('play', () => setPlayState(true));
    nativeAudio.addEventListener('pause', () => setPlayState(false));

    // Player Controls
    mainPlayBtn.addEventListener('click', togglePlayPause);
    replayBtn.addEventListener('click', replayAudio);
    muteBtn.addEventListener('click', toggleMute);

    // Playback rate cycle (1.0x -> 1.25x -> 1.5x -> 0.75x -> 1.0x)
    const rates = [1.0, 1.25, 1.5, 0.75];
    let rateIdx = 0;
    playbackRateBtn.addEventListener('click', () => {
      rateIdx = (rateIdx + 1) % rates.length;
      const rate = rates[rateIdx];
      nativeAudio.playbackRate = rate;
      playbackRateBtn.textContent = `${rate}x`;
    });

    // Progress Bar Scrubber
    progressBarWrapper.addEventListener('click', scrubAudio);

    // Clear History
    clearHistoryBtn.addEventListener('click', () => {
      historyItems = [];
      renderHistory();
    });

    // Modal Image Zoom
    document.querySelectorAll('.plot-card').forEach(card => {
      card.addEventListener('click', () => {
        const imgSrc = card.getAttribute('data-img');
        const title = card.getAttribute('data-title');
        openImageModal(imgSrc, title);
      });
    });
    closeModalBtn.addEventListener('click', closeImageModal);
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) closeImageModal();
    });

    // Hamburger: Toggle sidebar
    hamburgerBtn.addEventListener('click', toggleSidebar);

    // Expand Player
    expandPlayerBtn.addEventListener('click', toggleExpandPlayer);

    // Collapsed bar quick synth
    collapsedSynthBtn.addEventListener('click', handleSynthesize);
  }

  // --- Tab Switching ---
  function switchTab(tabId) {
    if (tabId === 'studio') {
      navStudioBtn.classList.add('active');
      navInsightsBtn.classList.remove('active');
      studioTab.classList.add('active');
      insightsTab.classList.remove('active');
      insightsTab.classList.add('hidden');
      studioTab.classList.remove('hidden');
    } else {
      navInsightsBtn.classList.add('active');
      navStudioBtn.classList.remove('active');
      insightsTab.classList.add('active');
      studioTab.classList.remove('active');
      studioTab.classList.add('hidden');
      insightsTab.classList.remove('hidden');
    }
  }

  // --- Sidebar Toggle (Hamburger) ---
  function toggleSidebar() {
    sidebarHidden = !sidebarHidden;

    if (sidebarHidden) {
      // Collapse sidebar, player takes full width
      studioGrid.classList.add('sidebar-hidden');
      hamburgerBtn.classList.add('open');
      hamburgerBtn.title = 'Tampilkan Panel Input (H)';
      collapsedSidebarBar.classList.remove('hidden');
      // Update collapsed bar meta text with current text
      const txt = ttsTextInput.value.trim();
      collapsedMeta.textContent = txt.length > 80 ? txt.slice(0, 77) + '...' : (txt || 'Belum ada teks. Buka sidebar untuk menginput teks.');
      // Also hide the input-card from accessibility
      if (inputCard) {
        inputCard.setAttribute('aria-hidden', 'true');
        inputCard.setAttribute('tabindex', '-1');
      }
    } else {
      // Show sidebar again
      studioGrid.classList.remove('sidebar-hidden');
      hamburgerBtn.classList.remove('open');
      hamburgerBtn.title = 'Sembunyikan Panel Input (H)';
      collapsedSidebarBar.classList.add('hidden');
      if (inputCard) {
        inputCard.removeAttribute('aria-hidden');
        inputCard.removeAttribute('tabindex');
      }
    }
  }

  // --- Expand Player Toggle ---
  function toggleExpandPlayer() {
    playerExpanded = !playerExpanded;

    if (playerExpanded) {
      studioGrid.classList.add('player-expanded');
      if (playerCard) playerCard.classList.add('expanded');
      expandIcon.classList.add('hidden');
      compressIcon.classList.remove('hidden');
      expandPlayerBtn.classList.add('active');
      expandPlayerBtn.title = 'Kembalikan Ukuran Player (E)';
      // Also show collapsed bar during expanded mode
      if (!sidebarHidden) {
        collapsedSidebarBar.classList.remove('hidden');
        const txt = ttsTextInput.value.trim();
        collapsedMeta.textContent = txt.length > 80 ? txt.slice(0, 77) + '...' : (txt || 'Panel input disembunyikan untuk memperluas player.');
      }
    } else {
      studioGrid.classList.remove('player-expanded');
      if (playerCard) playerCard.classList.remove('expanded');
      expandIcon.classList.remove('hidden');
      compressIcon.classList.add('hidden');
      expandPlayerBtn.classList.remove('active');
      expandPlayerBtn.title = 'Perluas Player (E)';
      // Only hide collapsed bar if sidebar is not also hidden
      if (!sidebarHidden) {
        collapsedSidebarBar.classList.add('hidden');
      }
    }
  }


  // --- API Calls ---
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        systemBadge.className = 'status-badge online';
        systemStatusText.textContent = `Model Siap (${data.device.toUpperCase()})`;
      } else {
        throw new Error('Health check failed');
      }
    } catch (err) {
      systemBadge.className = 'status-badge standby';
      systemStatusText.textContent = 'Server Menghubungkan...';
    }
  }

  async function loadVoices() {
    try {
      const res = await fetch('/api/voices');
      if (!res.ok) throw new Error('Gagal memuat preset suara');
      const data = await res.json();
      voicePresets = data.presets || [];
      renderVoiceCards();
    } catch (err) {
      console.error(err);
    }
  }

  function renderVoiceCards() {
    voicePresetsContainer.innerHTML = '';
    voicePresets.forEach(preset => {
      const card = document.createElement('div');
      card.className = `voice-card ${preset.id === selectedPreset ? 'selected' : ''}`;
      card.setAttribute('data-id', preset.id);

      card.innerHTML = `
        <div class="voice-card-top">
          <span class="voice-avatar">${preset.avatar || '🎙️'}</span>
          <span class="voice-tag">${preset.tag || preset.gender}</span>
        </div>
        <div class="voice-name">${preset.name}</div>
        <div class="voice-gender">${preset.gender}</div>
        <div class="voice-desc">${preset.description}</div>
      `;

      card.addEventListener('click', () => {
        selectVoiceCard(preset.id);
      });

      voicePresetsContainer.appendChild(card);
    });
  }

  function selectVoiceCard(presetId) {
    selectedPreset = presetId;
    document.querySelectorAll('.voice-card').forEach(c => {
      if (c.getAttribute('data-id') === presetId) {
        c.classList.add('selected');
      } else {
        c.classList.remove('selected');
      }
    });

    const currentPresetObj = voicePresets.find(p => p.id === presetId);
    if (currentPresetObj && currentPresetObj.seed !== null) {
      customSeedInput.value = currentPresetObj.seed;
    }
  }

  function updateCharCounter() {
    const len = ttsTextInput.value.length;
    charCounter.textContent = `${len} / 500 karakter`;
    if (len > 450) {
      charCounter.style.color = '#ef4444';
    } else {
      charCounter.style.color = 'var(--text-dim)';
    }
  }

  // --- Synthesis Handler ---
  async function handleSynthesize() {
    const text = ttsTextInput.value.trim();
    if (!text) {
      alert('Silakan masukkan teks terlebih dahulu.');
      ttsTextInput.focus();
      return;
    }

    if (isGenerating) return;
    setGeneratingState(true);

    const payload = {
      text: text,
      voice_preset: selectedPreset,
      custom_seed: parseInt(customSeedInput.value) || 42,
      speed: parseFloat(speedSlider.value) || 1.0,
      return_format: 'json'
    };

    try {
      const startTime = performance.now();
      const response = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Terjadi kesalahan pada server saat sintesis audio.');
      }

      const data = await response.json();
      const clientElapsed = ((performance.now() - startTime) / 1000).toFixed(2);

      // Load audio into player
      loadAudioToPlayer(data, text, payload);

    } catch (err) {
      alert(`Gagal membuat suara: ${err.message}`);
      console.error(err);
    } finally {
      setGeneratingState(false);
    }
  }

  function setGeneratingState(generating) {
    isGenerating = generating;
    synthesizeBtn.disabled = generating;
    if (generating) {
      synthIcon.classList.add('hidden');
      synthText.classList.add('hidden');
      synthLoader.classList.remove('hidden');
      canvasIdleOverlay.classList.remove('hidden');
      canvasIdleOverlay.querySelector('p').innerHTML = `
        <span style="color: var(--accent-cyan);">Menjalankan HiFi-GAN Vocoder...</span><br>
        <span style="font-size:0.75rem; color:var(--text-dim);">Mengonversi teks ke spektrogram lalu ke gelombang audio.</span>
      `;
    } else {
      synthIcon.classList.remove('hidden');
      synthText.classList.remove('hidden');
      synthLoader.classList.add('hidden');
    }
  }

  // --- Player Management ---
  function loadAudioToPlayer(data, text, payload) {
    const audioUrl = data.audio_base64;
    nativeAudio.src = audioUrl;
    currentEnvelope = data.waveform_envelope || [];

    // Enable player controls
    mainPlayBtn.disabled = false;
    replayBtn.disabled = false;
    downloadWavBtn.classList.remove('disabled');
    downloadWavBtn.href = audioUrl;
    downloadWavBtn.download = `speecht5_${data.preset}_${Date.now()}.wav`;

    // Metadata & Stats
    const presetName = voicePresets.find(p => p.id === data.preset)?.name || data.preset;
    audioMetaBadge.textContent = `${presetName} · 16 kHz · ${data.duration}s`;
    audioMetaBadge.classList.remove('hidden');

    statGenTime.textContent = `${data.generation_time}s`;
    statDuration.textContent = `${data.duration}s`;
    const rtf = (data.generation_time / data.duration).toFixed(2);
    statRtf.textContent = `${rtf}x (${rtf < 1.0 ? 'Faster than Realtime' : 'Normal'})`;
    generationStatsBar.classList.remove('hidden');

    // Hide idle overlay
    canvasIdleOverlay.classList.add('hidden');

    // Save to session history
    addToHistory({
      id: Date.now(),
      text: text,
      presetName: presetName,
      duration: data.duration,
      genTime: data.generation_time,
      audioUrl: audioUrl,
      envelope: currentEnvelope,
      timeString: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    // Auto-play
    playAudio();
  }

  function playAudio() {
    initWebAudio();
    nativeAudio.play().catch(e => {
      console.log('Autoplay dicegah browser, silakan klik play manual:', e);
    });
  }

  function togglePlayPause() {
    if (nativeAudio.paused) {
      playAudio();
    } else {
      nativeAudio.pause();
    }
  }

  function replayAudio() {
    nativeAudio.currentTime = 0;
    playAudio();
  }

  function toggleMute() {
    nativeAudio.muted = !nativeAudio.muted;
    if (nativeAudio.muted) {
      volHighIcon.classList.add('hidden');
      volMuteIcon.classList.remove('hidden');
    } else {
      volHighIcon.classList.remove('hidden');
      volMuteIcon.classList.add('hidden');
    }
  }

  function scrubAudio(e) {
    if (!nativeAudio.duration) return;
    const rect = progressBarWrapper.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    nativeAudio.currentTime = pos * nativeAudio.duration;
  }

  function onAudioLoaded() {
    totalDurationDisplay.textContent = formatTime(nativeAudio.duration);
    progressBar.style.width = '0%';
  }

  function onAudioTimeUpdate() {
    if (!nativeAudio.duration) return;
    const current = nativeAudio.currentTime;
    const duration = nativeAudio.duration;
    currentTimeDisplay.textContent = formatTime(current);
    const pct = (current / duration) * 100;
    progressBar.style.width = `${pct}%`;
  }

  function onAudioEnded() {
    setPlayState(false);
    progressBar.style.width = '100%';
    drawStaticEnvelope(currentEnvelope);
  }

  function setPlayState(playing) {
    if (playing) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
      startVisualizer();
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
      stopVisualizer();
      if (currentEnvelope.length > 0) {
        drawStaticEnvelope(currentEnvelope);
      }
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // --- Web Audio API Canvas Visualizer ---
  function initWebAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;

      sourceNode = audioCtx.createMediaElementSource(nativeAudio);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API context init error:', err);
    }
  }

  function startVisualizer() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (animFrameId) cancelAnimationFrame(animFrameId);

    const bufferLength = analyser ? analyser.frequencyBinCount : 0;
    const dataArray = analyser ? new Uint8Array(bufferLength) : null;

    function render() {
      animFrameId = requestAnimationFrame(render);
      if (!analyser || nativeAudio.paused) return;

      analyser.getByteFrequencyData(dataArray);

      const width = waveformCanvas.width;
      const height = waveformCanvas.height;
      canvasCtx.clearRect(0, 0, width, height);

      // Background gradient
      const bgGrad = canvasCtx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#0a0f1d');
      bgGrad.addColorStop(1, '#05070d');
      canvasCtx.fillStyle = bgGrad;
      canvasCtx.fillRect(0, 0, width, height);

      // Center baseline line
      canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      canvasCtx.lineWidth = 1;
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, height / 2);
      canvasCtx.lineTo(width, height / 2);
      canvasCtx.stroke();

      // Render reactive frequency bars mirrored top and bottom
      const barCount = 48;
      const barWidth = (width / barCount) - 3;
      let x = 4;

      for (let i = 0; i < barCount; i++) {
        const dataIdx = Math.floor((i / barCount) * (bufferLength * 0.75));
        const val = dataArray[dataIdx] || 10;
        const percent = val / 255;
        const barHeight = Math.max(4, percent * (height * 0.42));

        // Neon violet to cyber cyan gradient
        const barGrad = canvasCtx.createLinearGradient(0, height / 2 - barHeight, 0, height / 2 + barHeight);
        barGrad.addColorStop(0, '#06b6d4');
        barGrad.addColorStop(0.5, '#8b5cf6');
        barGrad.addColorStop(1, '#ec4899');

        canvasCtx.fillStyle = barGrad;
        // Top half
        canvasCtx.fillRect(x, height / 2 - barHeight, barWidth, barHeight);
        // Bottom mirror half
        canvasCtx.fillRect(x, height / 2, barWidth, barHeight * 0.65);

        x += barWidth + 3;
      }
    }

    render();
  }

  function stopVisualizer() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function drawIdleVisualizer() {
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    canvasCtx.clearRect(0, 0, width, height);

    canvasCtx.fillStyle = '#090e1a';
    canvasCtx.fillRect(0, 0, width, height);

    // Subtle gentle resting wave
    canvasCtx.strokeStyle = 'rgba(139, 92, 246, 0.25)';
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    for (let x = 0; x < width; x += 4) {
      const y = height / 2 + Math.sin(x * 0.04) * 6;
      if (x === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();
  }

  function drawStaticEnvelope(envelope) {
    if (!envelope || envelope.length === 0) return;
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    canvasCtx.clearRect(0, 0, width, height);

    // Background
    canvasCtx.fillStyle = '#090e1a';
    canvasCtx.fillRect(0, 0, width, height);

    const barWidth = width / envelope.length;
    for (let i = 0; i < envelope.length; i++) {
      const peak = envelope[i];
      const barHeight = Math.max(3, peak * (height * 0.38));

      canvasCtx.fillStyle = 'rgba(139, 92, 246, 0.45)';
      canvasCtx.fillRect(i * barWidth, height / 2 - barHeight, barWidth - 1, barHeight * 2);
    }
  }

  // --- History Management ---
  function addToHistory(item) {
    historyItems.unshift(item);
    if (historyItems.length > 20) historyItems.pop();
    renderHistory();
  }

  function renderHistory() {
    if (historyItems.length === 0) {
      emptyHistoryMsg.classList.remove('hidden');
      historyList.innerHTML = '';
      historyList.appendChild(emptyHistoryMsg);
      return;
    }

    emptyHistoryMsg.classList.add('hidden');
    historyList.innerHTML = '';

    historyItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';

      div.innerHTML = `
        <div class="history-item-left">
          <button class="history-play-btn" title="Putar audio ini">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <div class="history-details">
            <span class="history-text" title="${item.text}">${item.text}</span>
            <span class="history-meta">${item.presetName} &bull; ${item.duration}s &bull; ${item.timeString}</span>
          </div>
        </div>
        <div class="history-actions">
          <a href="${item.audioUrl}" download="speecht5_${item.id}.wav" class="icon-action-btn" title="Unduh WAV">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>
      `;

      // Play history audio on click
      div.querySelector('.history-play-btn').addEventListener('click', () => {
        nativeAudio.src = item.audioUrl;
        currentEnvelope = item.envelope || [];
        ttsTextInput.value = item.text;
        updateCharCounter();
        mainPlayBtn.disabled = false;
        replayBtn.disabled = false;
        downloadWavBtn.classList.remove('disabled');
        downloadWavBtn.href = item.audioUrl;
        audioMetaBadge.textContent = `${item.presetName} · 16 kHz · ${item.duration}s`;
        audioMetaBadge.classList.remove('hidden');
        canvasIdleOverlay.classList.add('hidden');
        playAudio();
      });

      historyList.appendChild(div);
    });
  }

  // --- Modal Image Zoom ---
  function openImageModal(src, title) {
    modalImg.src = src;
    modalTitle.textContent = title;
    imageModal.classList.remove('hidden');
  }

  function closeImageModal() {
    imageModal.classList.add('hidden');
    modalImg.src = '';
  }
});
