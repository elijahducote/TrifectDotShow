// player.js (optimized)

// SSR Guard - only run in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  (function() {
    'use strict';
    
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPlayer);
    } else {
      initPlayer();
    }
    
    function initPlayer() {
      // ============================================
      // DOM Elements (with null guards) – unchanged
      // ============================================
      const video = document.querySelector('video');
      if (!video) return;
      
      const playPauseBtn = document.querySelector('.play-pause-btn');
      const theaterBtn = document.querySelector('.theater-btn');
      const fullScreenBtn = document.querySelector('.full-screen-btn');
      const miniPlayerBtn = document.querySelector('.mini-player-btn');
      const muteBtn = document.querySelector('.mute-btn');
      const captionsBtn = document.querySelector('.captions-btn');
      const speedBtn = document.querySelector('.speed-btn');
      const currentTimeElem = document.querySelector('.current-time');
      const totalTimeElem = document.querySelector('.total-time');
      const previewImg = document.querySelector('.preview-img');
      const thumbnailImg = document.querySelector('.thumbnail-img');
      const volumeSlider = document.querySelector('.volume-slider');
      const videoContainer = document.querySelector('.video-container');
      const timelineContainer = document.querySelector('.timeline-container');
      const bufferBar = document.querySelector('.buffer-bar');
      const settingsBtn = document.querySelector('.settings-btn');
      const settingsContainer = document.querySelector('.settings-container');
      const qualityOptions = document.querySelectorAll('.quality-option');
      
      // ============================================
      // Mobile Detection & Performance Utilities – unchanged
      // ============================================
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1);
      
      let rafId = null;
      let pendingTimeUpdate = false;
      let pendingBufferUpdate = false;
      let lastRenderedTime = '';
      let lastRenderedProgress = -1;
      
      function scheduleRender() {
        if (rafId === null) {
          rafId = requestAnimationFrame(doRender);
        }
      }
      
      function doRender() {
        rafId = null;
        if (pendingTimeUpdate) {
          pendingTimeUpdate = false;
          actualTimeUpdate();
        }
        if (pendingBufferUpdate) {
          pendingBufferUpdate = false;
          actualBufferUpdate();
        }
      }
      
      function actualTimeUpdate() {
        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) return;
        
        const timeStr = formatTime(video.currentTime);
        if (timeStr !== lastRenderedTime) {
          lastRenderedTime = timeStr;
          if (currentTimeElem) currentTimeElem.textContent = timeStr;
        }
        
        if (!isScrubbing && timelineContainer) {
          const progress = video.currentTime / duration;
          if (Math.abs(progress - lastRenderedProgress) > 0.0005) {
            lastRenderedProgress = progress;
            timelineContainer.style.setProperty('--progress-position', progress);
          }
        }
      }
      
      function actualBufferUpdate() {
        const bar = getBufferBar();
        if (!bar) return;
        
        if (!video.buffered || video.buffered.length === 0) return;
        
        const duration = video.duration;
        if (!isFinite(duration) || duration <= 0) return;
        
        const currentTime = video.currentTime;
        let bufferEnd = 0;
        
        for (let i = 0; i < video.buffered.length; i++) {
          const start = video.buffered.start(i);
          const end = video.buffered.end(i);
          if (currentTime >= start && currentTime <= end) {
            bufferEnd = end;
            break;
          }
          if (end > bufferEnd) {
            bufferEnd = end;
          }
        }
        
        const percent = Math.min(100, (bufferEnd / duration) * 100);
        
        if (Math.abs(percent - lastBufferPercent) > 0.5) {
          bar.style.width = percent + '%';
          lastBufferPercent = percent;
          
          if (percent >= 99.5) {
            bar.classList.add('fully-buffered');
          } else {
            bar.classList.remove('fully-buffered');
          }
        }
      }
      
      // ============================================
      // Streaming Configuration – unchanged
      // ============================================
      const STREAM_CONFIG = {
        preferredFormat: 'auto',
        hlsSource: '/episode/hls/master.m3u8',
        dashSource: '/episode/dash/manifest.mpd',
        dashEnabled: true,
        hlsEnabled: true,
        thumbnails: {
          enabled: true,
          vttSource: '/episode/hls/thumbnails.vtt'
        }
      };
      
      let streamPlayer = null;
      let streamType = null;
      let currentQuality = 'auto';
      let isQualitySwitching = false;
      
      // ============================================
      // Feature Detection – unchanged
      // ============================================
      const features = {
        pictureInPicture: !!(document.pictureInPictureEnabled && video.requestPictureInPicture),
        fullscreen: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
        captions: false,
        previewImages: true,
        hls: typeof Hls !== 'undefined' && Hls.isSupported(),
        dash: typeof dashjs !== 'undefined' && dashjs.supportsMediaSource(),
        nativeHls: typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl') !== ''
      };
      
      // ============================================
      // VTT Thumbnail System – unchanged
      // ============================================
      const thumbnailSystem = {
        mode: "vtt",
        cues: [],
        spriteUrl: null,
        spriteLoaded: false,
        baseUrl: ''
      };
      
      async function parseVTT(vttUrl) {
        try {
          const response = await fetch(vttUrl);
          if (!response.ok) throw new Error('VTT fetch failed');
          const text = await response.text();
          const cues = [];
          const baseUrl = vttUrl.substring(0, vttUrl.lastIndexOf('/') + 1);
          thumbnailSystem.baseUrl = baseUrl;
          const blocks = text.trim().split(/\n\s*\n/);
          
          for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) continue;
            
            let timestampLineIndex = -1;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(' --> ')) {
                timestampLineIndex = i;
                break;
              }
            }
            if (timestampLineIndex === -1) continue;
            
            const timestampLine = lines[timestampLineIndex];
            const payloadLines = lines.slice(timestampLineIndex + 1);
            const payload = payloadLines.join('\n').trim();
            if (!payload) continue;
            
            const timestampMatch = timestampLine.match(
              /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
              );
              if (!timestampMatch) continue;
              
              const start = parseTimestamp(timestampMatch.slice(1, 5));
              const end = parseTimestamp(timestampMatch.slice(5, 9));
              
              const xywh = payload.match(/#xywh=(\d+),(\d+),(\d+),(\d+)/);
              
              if (xywh) {
                const imageUrl = payload.split('#')[0];
                cues.push({
                  start,
                  end,
                  url: imageUrl.startsWith('http') ? imageUrl : baseUrl + imageUrl,
                  x: parseInt(xywh[1], 10),
                  y: parseInt(xywh[2], 10),
                  w: parseInt(xywh[3], 10),
                  h: parseInt(xywh[4], 10)
                });
                
                if (!thumbnailSystem.spriteUrl) {
                  thumbnailSystem.spriteUrl = cues[cues.length - 1].url;
                }
              } else {
                cues.push({
                  start,
                  end,
                  url: payload.startsWith('http') ? payload : baseUrl + payload,
                  x: 0,
                  y: 0,
                  w: null,
                  h: null
                });
              }
          }
          return cues;
        } catch (err) {
          console.warn('VTT parsing failed:', err);
          return null;
        }
      }
      
      function parseTimestamp(parts) {
        const [h, m, s, ms] = parts.map(Number);
        return h * 3600 + m * 60 + s + ms / 1000;
      }
      
      function findCueForTime(time) {
        if (!thumbnailSystem.cues.length) return null;
        let low = 0;
        let high = thumbnailSystem.cues.length - 1;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          const cue = thumbnailSystem.cues[mid];
          if (time >= cue.start && time < cue.end) {
            return cue;
          } else if (time < cue.start) {
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }
        return thumbnailSystem.cues[thumbnailSystem.cues.length - 1];
      }
      
      function applyThumbnail(element, time) {
        if (!element || !features.previewImages || thumbnailSystem.mode !== 'vtt') return;
        
        const cue = findCueForTime(time);
        if (!cue) return;
        
        if (cue.w && cue.h) {
          element.style.backgroundImage = `url('${cue.url}')`;
          element.style.backgroundPosition = `-${cue.x}px -${cue.y}px`;
          element.style.backgroundSize = 'auto';
          element.style.backgroundRepeat = 'no-repeat';
          element.style.width = cue.w + 'px';
          element.style.height = cue.h + 'px';
          
          if (element.tagName === 'IMG') {
            element.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          }
        } else {
          if (element.tagName === 'IMG') {
            element.src = cue.url;
            element.style.backgroundImage = '';
          } else {
            element.style.backgroundImage = `url('${cue.url}')`;
            element.style.backgroundPosition = 'center';
            element.style.backgroundSize = 'contain';
          }
        }
      }
      
      function preloadSprite(url) {
        if (!url || thumbnailSystem.spriteLoaded) return;
        const img = new Image();
        img.onload = function() {
          thumbnailSystem.spriteLoaded = true;
        };
        img.src = url;
      }
      
      async function initThumbnails() {
        if (!STREAM_CONFIG.thumbnails.enabled) {
          features.previewImages = false;
          hideElement(previewImg);
          hideElement(thumbnailImg);
          return;
        }
        
        const vttUrl = STREAM_CONFIG.thumbnails.vttSource;
        if (vttUrl) {
          const cues = await parseVTT(vttUrl);
          if (cues && cues.length > 0) {
            thumbnailSystem.cues = cues;
            thumbnailSystem.mode = 'vtt';
            features.previewImages = true;
            
            if (thumbnailSystem.spriteUrl) {
              preloadSprite(thumbnailSystem.spriteUrl);
            }
            return;
          }
        }
        
        thumbnailSystem.mode = null;
        features.previewImages = false;
        hideElement(previewImg);
        hideElement(thumbnailImg);
      }
      
      function hideElement(el) {
        if (!el) return;
        el.style.display = 'none';
      }
      
      // ============================================
      // Stream Initialization – unchanged
      // ============================================
      async function initStream() {
        const format = STREAM_CONFIG.preferredFormat;
        
        if (STREAM_CONFIG.dashEnabled && (format === 'dash' || format === 'auto') && features.dash && !isAppleDevice()) {
          const dashAvailable = await checkFileExists(STREAM_CONFIG.dashSource);
          if (dashAvailable) {
            initDASH();
            return;
          }
        }
        
        if (STREAM_CONFIG.hlsEnabled && (format === 'hls' || format === 'auto') && features.hls) {
          const hlsAvailable = await checkFileExists(STREAM_CONFIG.hlsSource);
          if (hlsAvailable) {
            initHLS();
            return;
          }
        }
        
        if (STREAM_CONFIG.hlsEnabled && features.nativeHls) {
          const hlsAvailable = await checkFileExists(STREAM_CONFIG.hlsSource);
          if (hlsAvailable) {
            initNativeHLS();
            return;
          }
        }
        
        if (STREAM_CONFIG.mp4Fallback) video.src = STREAM_CONFIG.mp4Fallback;
        streamType = 'mp4';
      }

      async function checkFileExists(url) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          return response.ok;
        } catch {
          return false;
        }
      }
      
      function isAppleDevice() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.userAgentData?.platform === 'macOS' && navigator.maxTouchPoints > 1) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      }
      
      // ============================================
      // DASH – improved error handling, quality switching (non‑destructive)
      // ============================================
      function initDASH() {
        streamType = 'dash';
        streamPlayer = dashjs.MediaPlayer().create();
        streamPlayer.initialize(video, STREAM_CONFIG.dashSource, false);
        
        streamPlayer.updateSettings({
          streaming: {
            buffer: {
              fastSwitchEnabled: true,
              stableBufferTime: isMobile ? 8 : 12,
              bufferTimeAtTopQuality: isMobile ? 12 : 20,
              bufferToKeep: isMobile ? 5 : 10,
              bufferPruningInterval: 5
            },
            abr: {
              autoSwitchBitrate: { video: true, audio: true },
              limitBitrateByPortal: isMobile
            }
          }
        });
        
        streamPlayer.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, throttledBufferUpdate);
        streamPlayer.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, startBufferMonitoring);
        
        streamPlayer.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, function() {
          if (isQualitySwitching) finishQualitySwitch();
          updateActiveQualityUI();
        });
        
        streamPlayer.on(dashjs.MediaPlayer.events.ERROR, function(e) {
          console.error('DASH error:', e.error);
          // Attempt recovery: if fatal, fallback to MP4 after a few retries
          if (e.error && e.error.code === dashjs.MediaPlayer.errors.MANIFEST_LOADER_PARSING_FAILURE) {
            fallbackToMP4();
          }
        });
      }
      
      // ============================================
      // HLS – improved error handling, quality switching (non‑destructive)
      // ============================================
      function initHLS() {
        streamType = 'hls';
        
        streamPlayer = new Hls({
          maxBufferLength: isMobile ? 8 : 10,
          maxMaxBufferLength: isMobile ? 15 : 20,
          maxBufferSize: isMobile ? 15 * 1000000 : 30 * 1000000,
          maxBufferHole: 0.5,
          startLevel: -1,
          autoStartLoad: true,
          startPosition: -1,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 3,
          abrEwmaDefaultEstimate: 500000,
          abrBandWidthFactor: 0.95,
          abrBandWidthUpFactor: 0.7,
          fragLoadingTimeOut: 20000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000,
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: isMobile ? 10 : 15
        });
        
        streamPlayer.loadSource(STREAM_CONFIG.hlsSource);
        streamPlayer.attachMedia(video);
        
        streamPlayer.on(Hls.Events.FRAG_BUFFERED, throttledBufferUpdate);
        
        streamPlayer.on(Hls.Events.LEVEL_SWITCHED, function() {
          if (isQualitySwitching) finishQualitySwitch();
          updateActiveQualityUI();
        });
        
        streamPlayer.on(Hls.Events.ERROR, function(_event, data) {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                // Try to recover network error
                streamPlayer.startLoad();
                break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  streamPlayer.recoverMediaError();
                  break;
                  default:
                  // Cannot recover, fallback to MP4
                  fallbackToMP4();
                  break;
            }
          }
        });
        
        streamPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
          startBufferMonitoring();
        });
      }
      
      function throttledBufferUpdate() {
        pendingBufferUpdate = true;
        scheduleRender();
      }
      
      function initNativeHLS() {
        streamType = 'native';
        video.src = STREAM_CONFIG.hlsSource;
      }
      
      function fallbackToMP4() {
        if (streamPlayer) {
          if (streamType === 'hls') {
            streamPlayer.destroy();
          } else if (streamType === 'dash') {
            streamPlayer.reset();
          }
          streamPlayer = null;
        }
        if (STREAM_CONFIG.mp4Fallback) video.src = STREAM_CONFIG.mp4Fallback;
        streamType = 'mp4';
      }

      // ============================================
      // Quality Selection – NOW NON‑DESTRUCTIVE & SEAMLESS
      // ============================================
      let qualitySwitchTimeout = null;
      let savedPlaybackState = null;
      
      function finishQualitySwitch() {
        if (!isQualitySwitching) return;
        
        isQualitySwitching = false;
        
        if (qualitySwitchTimeout) {
          clearTimeout(qualitySwitchTimeout);
          qualitySwitchTimeout = null;
        }
        
        if (videoContainer) {
          videoContainer.classList.remove('buffering');
        }
        
        if (savedPlaybackState && !savedPlaybackState.wasPaused) {
          video.play().catch(function() {});
        }
        savedPlaybackState = null;
        
        updateActiveQualityUI();
      }
      
      async function selectQuality(quality) {
        if (currentQuality === quality) {
          setTimeout(closeSettingsMenu, 100);
          return;
        }
        
        if (!streamPlayer && streamType !== 'mp4' && streamType !== 'native') {
          currentQuality = quality;
          setTimeout(closeSettingsMenu, 100);
          return;
        }
        
        // Update UI immediately
        qualityOptions.forEach(function(opt) {
          opt.classList.toggle('active', opt.dataset.quality === quality);
        });
        
        isQualitySwitching = true;
        if (videoContainer) videoContainer.classList.add('buffering');
        
        if (qualitySwitchTimeout) clearTimeout(qualitySwitchTimeout);
        qualitySwitchTimeout = setTimeout(function() {
          finishQualitySwitch();
        }, 8000);
        
        savedPlaybackState = {
          time: video.currentTime,
          wasPaused: video.paused
        };
        
        try {
          if (streamType === 'dash') {
            switchDashQuality(quality);
          } else if (streamType === 'hls') {
            switchHLSQuality(quality);
          } else {
            finishQualitySwitch();
          }
        } catch (error) {
          console.error('Quality switch failed:', error);
          finishQualitySwitch();
        }
        
        currentQuality = quality;
        setTimeout(closeSettingsMenu, 100);
      }
      
      function findClosestQuality(list, targetHeight, heightKey = 'height') {
        let bestIndex = -1;
        let bestDiff = Infinity;
        for (let i = 0; i < list.length; i++) {
          const h = list[i][heightKey];
          if (!h) continue;
          if (h === targetHeight) return i;
          const diff = Math.abs(h - targetHeight);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = i;
          }
        }
        return bestIndex;
      }
      
      // ---- DASH seamless quality switch ----
      function switchDashQuality(quality) {
        if (!streamPlayer) return;
        
        if (quality === 'auto') {
          // Re-enable ABR
          streamPlayer.updateSettings({
            streaming: {
              abr: { autoSwitchBitrate: { video: true, audio: true } }
            }
          });
          finishQualitySwitch();
          return;
        }
        
        const bitrateInfos = streamPlayer.getBitrateInfoListFor('video');
        if (!bitrateInfos || bitrateInfos.length === 0) return;
        
        const targetIndex = findClosestQuality(bitrateInfos, parseInt(quality, 10));
        if (targetIndex === -1) return;
        
        // Disable ABR and lock quality – this switches seamlessly at next fragment
        streamPlayer.updateSettings({
          streaming: {
            abr: { autoSwitchBitrate: { video: false, audio: false } }
          }
        });
        streamPlayer.setQualityFor('video', targetIndex);
        
        // No need to reload – dash.js will continue with new quality
        // But we must ensure we finish the switch after a short delay
        // (QUALITY_CHANGE_RENDERED will call finishQualitySwitch)
        // However, if no quality change event fires (e.g., same quality), we force finish
        setTimeout(() => {
          if (isQualitySwitching) finishQualitySwitch();
        }, 500);
      }
      
      // ---- HLS seamless quality switch ----
      function switchHLSQuality(quality) {
        if (!streamPlayer) return;
        
        if (quality === 'auto') {
          streamPlayer.currentLevel = -1;
          streamPlayer.loadLevel = -1;
          streamPlayer.nextLevel = -1;
          finishQualitySwitch();
          return;
        }
        
        const levels = streamPlayer.levels;
        if (!levels || levels.length === 0) return;
        
        const targetLevel = findClosestQuality(levels, parseInt(quality, 10));
        if (targetLevel === -1) return;
        
        // Lock to target level – HLS.js switches at next segment boundary
        streamPlayer.currentLevel = targetLevel;
        streamPlayer.loadLevel = targetLevel;
        streamPlayer.nextLevel = targetLevel;
        
        // LEVEL_SWITCHED event will call finishQualitySwitch, but we add a safety timeout
        setTimeout(() => {
          if (isQualitySwitching) finishQualitySwitch();
        }, 500);
      }
      
      function updateActiveQualityUI() {
        if (streamType === 'hls' && streamPlayer && streamPlayer.levels) {
          const currentLevel = streamPlayer.currentLevel;
          
          if (currentLevel === -1) {
            qualityOptions.forEach(function(opt) {
              opt.classList.toggle('active', opt.dataset.quality === 'auto');
            });
            return;
          }
          
          const level = streamPlayer.levels[currentLevel];
          if (level && level.height) {
            qualityOptions.forEach(function(opt) {
              const optQuality = opt.dataset.quality;
              if (optQuality === 'auto') {
                opt.classList.remove('active');
              } else {
                const optHeight = parseInt(optQuality, 10);
                opt.classList.toggle('active', level.height === optHeight);
              }
            });
            return;
          }
        }
        
        if (streamType === 'dash' && streamPlayer) {
          const qualityIndex = streamPlayer.getQualityFor('video');
          const bitrateInfos = streamPlayer.getBitrateInfoListFor('video');
          
          if (bitrateInfos && bitrateInfos[qualityIndex]) {
            const currentHeight = bitrateInfos[qualityIndex].height;
            qualityOptions.forEach(function(opt) {
              const optQuality = opt.dataset.quality;
              if (optQuality === 'auto') {
                opt.classList.remove('active');
              } else {
                const optHeight = parseInt(optQuality, 10);
                opt.classList.toggle('active', currentHeight === optHeight);
              }
            });
            return;
          }
        }
        
        qualityOptions.forEach(function(opt) {
          opt.classList.toggle('active', opt.dataset.quality === currentQuality);
        });
      }
      
      let qualitySelectDebounce = false;
      
      qualityOptions.forEach(function(opt) {
        function handleQualitySelect(e) {
          e.preventDefault();
          e.stopPropagation();
          
          if (qualitySelectDebounce) return;
          qualitySelectDebounce = true;
          setTimeout(function() { qualitySelectDebounce = false; }, 300);
          
          selectQuality(opt.dataset.quality);
        }
        
        opt.addEventListener('click', handleQualitySelect);
        opt.addEventListener('touchend', handleQualitySelect, { passive: false });
      });
      
      // ============================================
      // Initialize – unchanged
      // ============================================
      function init() {
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        
        if (!features.pictureInPicture && miniPlayerBtn) {
          miniPlayerBtn.classList.add('hidden');
          miniPlayerBtn.disabled = true;
        }
        if (!features.fullscreen && fullScreenBtn) {
          fullScreenBtn.classList.add('hidden');
          fullScreenBtn.disabled = true;
        }
        
        initCaptions();
        initThumbnails();
        initStream();
        
        currentQuality = 'auto';
        qualityOptions.forEach(function(opt) {
          opt.classList.toggle('active', opt.dataset.quality === 'auto');
        });
        
        if (playPauseBtn) playPauseBtn.setAttribute('data-tooltip', 'Play (k)');
      }
      
      // ============================================
      // Captions – unchanged
      // ============================================
      let captions = null;
      
      function initCaptions() {
        const track = video.querySelector('track');
        if (!track) return disableCaptions('No track');
        
        if (video.textTracks && video.textTracks.length > 0) {
          captions = video.textTracks[0];
          captions.mode = 'hidden';
          features.captions = true;
          track.addEventListener('error', function() { disableCaptions('Load failed'); });
        } else {
          disableCaptions('Not supported');
        }
      }
      
      function disableCaptions() {
        features.captions = false;
        if (captionsBtn) {
          captionsBtn.classList.add('feature-unavailable');
          captionsBtn.disabled = true;
          captionsBtn.setAttribute('data-tooltip', 'Unavailable');
        }
      }
      
      function toggleCaptions() {
        if (!features.captions || !captions) return;
        const isHidden = captions.mode === 'hidden';
        captions.mode = isHidden ? 'showing' : 'hidden';
        if (videoContainer) videoContainer.classList.toggle('captions', isHidden);
        if (captionsBtn) captionsBtn.setAttribute('data-tooltip', isHidden ? 'Captions off (c)' : 'Captions (c)');
      }
      
      if (captionsBtn) captionsBtn.addEventListener('click', toggleCaptions);
      
      // ============================================
      // Keyboard Shortcuts – unchanged
      // ============================================
      document.addEventListener('keydown', function(e) {
        const tag = document.activeElement.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        
        switch (e.key.toLowerCase()) {
          case ' ':
            if (tag === 'button') return;
            case 'k': togglePlayPause(); e.preventDefault(); break;
            case 'f': if (features.fullscreen) toggleFullScreen(); break;
            case 't': toggleTheater(); break;
            case 'i': if (features.pictureInPicture) toggleMiniPlayer(); break;
            case 'm': toggleMute(); break;
            case 'arrowleft': case 'j': skip(-5); e.preventDefault(); break;
            case 'arrowright': case 'l': skip(5); e.preventDefault(); break;
            case 'c': if (features.captions) toggleCaptions(); break;
            case 'escape': closeSettingsMenu(); break;
        }
      });
      
      // ============================================
      // Timeline & Scrubbing – unchanged
      // ============================================
      // player.js (optimized for mobile)

// ... (previous code unchanged until the Timeline & Scrubbing section)

      // ============================================
      // Timeline & Scrubbing (Optimized for Mobile)
      // ============================================
      let isScrubbing = false;
      let wasPaused = false;
      
      // Throttle function for mobile pointermove
      const throttle = (fn, delay) => {
        let lastCall = 0;
        return function(...args) {
          const now = performance.now();
          if (now - lastCall >= delay) {
            lastCall = now;
            fn.apply(this, args);
          }
        };
      };

      // Use 30fps on mobile for preview updates
      const PREVIEW_THROTTLE = isMobile ? 33 : 16; // ~30fps or 60fps

      const throttledUpdateHoverPreview = throttle((clientX) => {
        updateHoverPreview(clientX);
      }, PREVIEW_THROTTLE);

      const throttledUpdateScrub = throttle((clientX) => {
        updateScrub(clientX);
      }, PREVIEW_THROTTLE);
      
      if (timelineContainer) {
        if (window.PointerEvent) {
          timelineContainer.addEventListener('pointerdown', onPointerDown);
          timelineContainer.addEventListener('pointermove', (e) => {
            if (isScrubbing) {
              // Use throttled scrub update
              throttledUpdateScrub(e.clientX);
            } else {
              throttledUpdateHoverPreview(e.clientX);
            }
          }, { passive: true });
        } else {
          timelineContainer.addEventListener('mousedown', onMouseDown);
          timelineContainer.addEventListener('mousemove', (e) => {
            if (isScrubbing) {
              throttledUpdateScrub(e.clientX);
            } else {
              throttledUpdateHoverPreview(e.clientX);
            }
          });
        }
      }
      
      function onPointerDown(e) {
        // ... unchanged ...
      }
      
      function onPointerMove(e) {
        // Now handled by throttled listener, so this function can be removed or left empty.
      }
      
      // ... onMouseDown, onMouseMove similarly updated ...
      // (I'll rewrite the full section for clarity)
      
      function onPointerDown(e) {
        if (!e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        e.preventDefault();
        startScrub(e.clientX);
        
        timelineContainer.setPointerCapture(e.pointerId);
        
        const onPointerMove = function(ev) {
          if (isScrubbing) updateScrub(ev.clientX);
        };
        
        const onPointerUp = function(ev) {
          endScrub(ev.clientX);
          timelineContainer.releasePointerCapture(e.pointerId);
          timelineContainer.removeEventListener('pointermove', onPointerMove);
          timelineContainer.removeEventListener('pointerup', onPointerUp);
          timelineContainer.removeEventListener('pointercancel', onPointerUp);
        };
        
        timelineContainer.addEventListener('pointermove', onPointerMove);
        timelineContainer.addEventListener('pointerup', onPointerUp);
        timelineContainer.addEventListener('pointercancel', onPointerUp);
      }
      
      
      function onMouseDown(e) {
        if (e.button !== 0) return;
        
        startScrub(e.clientX);
        
        const onMouseMoveDoc = function(ev) {
          if (isScrubbing) updateScrub(ev.clientX);
        };
        
        const onMouseUpDoc = function(ev) {
          endScrub(ev.clientX);
          document.removeEventListener('mousemove', onMouseMoveDoc);
          document.removeEventListener('mouseup', onMouseUpDoc);
        };
        
        document.addEventListener('mousemove', onMouseMoveDoc);
        document.addEventListener('mouseup', onMouseUpDoc);
      }
      
      function onMouseMove(e) {
        if (isScrubbing) return;
        updateHoverPreview(e.clientX);
      }
      
      function startScrub(clientX) {
        isScrubbing = true;
        wasPaused = video.paused;
        video.pause();
        if (videoContainer) videoContainer.classList.add('scrubbing');
        updateScrub(clientX);
      }
      
      function updateScrub(clientX) {
        if (!timelineContainer) return;
        const rect = timelineContainer.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        
        timelineContainer.style.setProperty('--preview-position', percent);
        timelineContainer.style.setProperty('--progress-position', percent);
        lastRenderedProgress = percent;
        
        if (features.previewImages && isFinite(video.duration) && video.duration > 0 && thumbnailImg) {
          applyThumbnail(thumbnailImg, percent * video.duration);
        }
      }
      
      function endScrub(clientX) {
        if (!isScrubbing) return;
        
        const rect = timelineContainer.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        
        isScrubbing = false;
        if (videoContainer) videoContainer.classList.remove('scrubbing');
        
        if (isFinite(video.duration) && video.duration > 0) {
          video.currentTime = percent * video.duration;
        }
        
        if (!wasPaused) video.play().catch(function() {});
      }
      
      function updateHoverPreview(clientX) {
        if (!timelineContainer) return;
        const rect = timelineContainer.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        
        timelineContainer.style.setProperty('--preview-position', percent);
        
        if (features.previewImages && isFinite(video.duration) && video.duration > 0 && previewImg) {
          applyThumbnail(previewImg, percent * video.duration);
        }
      }
      
      // ============================================
      // Buffer Bar – unchanged (already throttled)
      // ============================================
      let bufferUpdateInterval = null;
      let lastBufferPercent = -1;
      let bufferBarElement = null;
      
      function getBufferBar() {
        if (!bufferBarElement) bufferBarElement = bufferBar;
        return bufferBarElement;
      }
      
      function updateBufferBar() {
        pendingBufferUpdate = true;
        scheduleRender();
      }
      
      function startBufferMonitoring() {
        if (bufferUpdateInterval) return;
        actualBufferUpdate();
        bufferUpdateInterval = setInterval(updateBufferBar, isMobile ? 1000 : 500);
      }
      
      function stopBufferMonitoring() {
        if (bufferUpdateInterval) {
          clearInterval(bufferUpdateInterval);
          bufferUpdateInterval = null;
        }
      }
      
      video.addEventListener('progress', updateBufferBar, { passive: true });
      video.addEventListener('loadedmetadata', function() {
        updateBufferBar();
        startBufferMonitoring();
      });
      video.addEventListener('seeking', updateBufferBar, { passive: true });
      video.addEventListener('seeked', updateBufferBar, { passive: true });
      video.addEventListener('play', startBufferMonitoring);
      video.addEventListener('pause', stopBufferMonitoring);
      video.addEventListener('ended', stopBufferMonitoring);
      
      // ============================================
      // Loading State – unchanged
      // ============================================
      let bufferingTimeout = null;
      
      video.addEventListener('waiting', function() {
        if (isQualitySwitching) return;
        
        clearTimeout(bufferingTimeout);
        bufferingTimeout = setTimeout(function() {
          if (videoContainer && !isQualitySwitching) {
            videoContainer.classList.add('buffering');
          }
        }, 200);
      });
      
      function clearBuffering() {
        clearTimeout(bufferingTimeout);
        if (videoContainer) videoContainer.classList.remove('buffering');
        if (isQualitySwitching) finishQualitySwitch();
      }
      
      video.addEventListener('playing', clearBuffering);
      video.addEventListener('canplaythrough', clearBuffering);
      
      // ============================================
      // Playback Speed – unchanged
      // ============================================
      const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      
      if (speedBtn) {
        speedBtn.addEventListener('click', function() {
          const idx = (speeds.indexOf(video.playbackRate) + 1) % speeds.length;
          video.playbackRate = speeds[idx];
          speedBtn.textContent = speeds[idx] + 'x';
        });
      }
      
      // ============================================
      // Settings Menu – unchanged
      // ============================================
      let settingsMenuOpen = false;
      let settingsCloseTimeout = null;
      
      if (settingsBtn) {
        let settingsToggleDebounce = false;
        
        function handleSettingsToggle(e) {
          e.preventDefault();
          e.stopPropagation();
          
          if (settingsToggleDebounce) return;
          settingsToggleDebounce = true;
          setTimeout(function() { settingsToggleDebounce = false; }, 300);
          
          toggleSettingsMenu();
        }
        
        settingsBtn.addEventListener('click', handleSettingsToggle);
        settingsBtn.addEventListener('touchend', handleSettingsToggle, { passive: false });
      }
      
      function closeOnOutsideInteraction(e) {
        if (settingsMenuOpen && settingsContainer && !settingsContainer.contains(e.target)) {
          closeSettingsMenu();
        }
      }
      
      document.addEventListener('click', closeOnOutsideInteraction);
      document.addEventListener('touchend', closeOnOutsideInteraction, { passive: true });
      
      if (settingsContainer) {
        settingsContainer.addEventListener('mouseenter', function() { clearTimeout(settingsCloseTimeout); });
        settingsContainer.addEventListener('mouseleave', function() {
          if (settingsMenuOpen) settingsCloseTimeout = setTimeout(closeSettingsMenu, 300);
        });
        
        settingsContainer.addEventListener('touchstart', function(e) {
          e.stopPropagation();
          clearTimeout(settingsCloseTimeout);
        }, { passive: true });
      }
      
      function toggleSettingsMenu() {
        settingsMenuOpen = !settingsMenuOpen;
        clearTimeout(settingsCloseTimeout);
        if (settingsMenuOpen) {
          if (settingsContainer) settingsContainer.classList.add('active');
        } else {
          if (settingsContainer) settingsContainer.classList.remove('active');
        }
      }
      
      function closeSettingsMenu() {
        settingsMenuOpen = false;
        if (settingsContainer) settingsContainer.classList.remove('active');
        clearTimeout(settingsCloseTimeout);
      }
      
      // ============================================
      // Tooltip Repositioning – FIXED MEMORY LEAK
      // ============================================
      function setupTooltipRepositioning() {
        if (isMobile) return;
        
        const tooltipButtons = document.querySelectorAll('.video-controls-container .controls button[data-tooltip]');
        const measurer = document.createElement('span');
        measurer.style.cssText = 'position:absolute;visibility:hidden;font-size:0.75em;padding:0.3125em 0.625em;white-space:nowrap;font-family:system-ui,-apple-system,sans-serif;font-weight:500;';
        document.body.appendChild(measurer);
        
        tooltipButtons.forEach(function(btn) {
          btn.addEventListener('mouseenter', function() {
            const tooltipText = btn.getAttribute('data-tooltip');
            if (!tooltipText) return;
            
            measurer.textContent = tooltipText;
            const tooltipWidth = measurer.offsetWidth + 16;
            
            const btnRect = btn.getBoundingClientRect();
            const bounds = videoContainer ? videoContainer.getBoundingClientRect() : { left: 0, right: window.innerWidth };
            const btnCenter = btnRect.left + (btnRect.width / 2);
            
            btn.classList.remove('tooltip-left', 'tooltip-right');
            
            if (btnCenter - (tooltipWidth / 2) < bounds.left) {
              btn.classList.add('tooltip-left');
            } else if (btnCenter + (tooltipWidth / 2) > bounds.right) {
              btn.classList.add('tooltip-right');
            }
          });
        });
        
        // Clean up measurer on page unload (optional, but good practice)
        window.addEventListener('beforeunload', function() {
          if (measurer && measurer.parentNode) {
            measurer.parentNode.removeChild(measurer);
          }
        });
      }
      
      setupTooltipRepositioning();
      
      // ============================================
      // Time & Duration – unchanged
      // ============================================
      function skip(sec) {
        if (!isFinite(video.duration) || video.duration <= 0) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + sec));
      }
      
      video.addEventListener('loadedmetadata', function() {
        if (totalTimeElem) totalTimeElem.textContent = formatTime(video.duration);
        updateBufferBar();
      });
      
      video.addEventListener('timeupdate', function() {
        pendingTimeUpdate = true;
        scheduleRender();
      }, { passive: true });
      
      function formatTime(t) {
        if (isNaN(t)) return '0:00';
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = Math.floor(t % 60);
        return h > 0
        ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
        : m + ':' + String(s).padStart(2, '0');
      }
      
      // ============================================
      // Volume – unchanged
      // ============================================
      if (muteBtn) muteBtn.addEventListener('click', toggleMute);
      if (volumeSlider) volumeSlider.addEventListener('input', updateVolume, { passive: true });
      
      function toggleMute() {
        video.muted = !video.muted;
        if (muteBtn) muteBtn.setAttribute('data-tooltip', video.muted ? 'Unmute (m)' : 'Mute (m)');
      }
      
      function updateVolume() {
        if (!volumeSlider) return;
        video.volume = volumeSlider.value;
        video.muted = volumeSlider.value === '0';
      }
      
      video.addEventListener('volumechange', function() {
        if (volumeSlider) volumeSlider.value = video.muted ? 0 : video.volume;
        if (videoContainer) {
          videoContainer.dataset.volumeLevel = video.muted || video.volume === 0 ? 'muted' : video.volume < 0.5 ? 'low' : 'high';
        }
        if (muteBtn) muteBtn.setAttribute('data-tooltip', video.muted ? 'Unmute (m)' : 'Mute (m)');
      });
      
      // ============================================
      // View Modes – unchanged
      // ============================================
      if (miniPlayerBtn) miniPlayerBtn.addEventListener('click', toggleMiniPlayer);
      if (theaterBtn) theaterBtn.addEventListener('click', toggleTheater);
      if (fullScreenBtn) fullScreenBtn.addEventListener('click', toggleFullScreen);
      
      function toggleMiniPlayer() {
        if (!features.pictureInPicture) return;
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(function() {});
        } else {
          video.requestPictureInPicture().catch(function() {});
        }
      }
      
      function toggleTheater() {
        if (videoContainer) videoContainer.classList.toggle('theater');
        if (theaterBtn) {
          theaterBtn.setAttribute('data-tooltip',
          videoContainer && videoContainer.classList.contains('theater') ? 'Exit theater (t)' : 'Theater mode (t)');
        }
      }
      
      function toggleFullScreen() {
        if (!features.fullscreen) return;
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else if (videoContainer) {
          var fsPromise;
          if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
            return;
          }
          if (videoContainer.requestFullscreen) {
            fsPromise = videoContainer.requestFullscreen();
          } else if (videoContainer.webkitRequestFullscreen) {
            fsPromise = videoContainer.webkitRequestFullscreen();
          }
          if (fsPromise && fsPromise.then) {
            fsPromise.then(function() {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape-primary')
                .catch(function() {
                  return screen.orientation.lock('landscape');
                })
                .catch(function() {});
              }
            }).catch(function() {});
          }
        }
      }
      
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function(ev) {
        document.addEventListener(ev, function() {
          var isFS = document.fullscreenElement || document.webkitFullscreenElement;
          if (videoContainer) videoContainer.classList.toggle('full-screen', !!isFS);
          if (fullScreenBtn) fullScreenBtn.setAttribute('data-tooltip', isFS ? 'Exit full screen (f)' : 'Full screen (f)');
          if (isFS) {
            showControls();
          } else {
            clearTimeout(controlsTimeout);
            if (videoContainer) videoContainer.classList.remove('controls-visible');
            controlsVisible = false;
            if (screen.orientation && screen.orientation.unlock) {
              screen.orientation.unlock();
            }
          }
        });
      });
      
      video.addEventListener('enterpictureinpicture', function() {
        if (videoContainer) videoContainer.classList.add('mini-player');
        if (miniPlayerBtn) miniPlayerBtn.setAttribute('data-tooltip', 'Exit mini player (i)');
      });
      
      video.addEventListener('leavepictureinpicture', function() {
        if (videoContainer) videoContainer.classList.remove('mini-player');
        if (miniPlayerBtn) miniPlayerBtn.setAttribute('data-tooltip', 'Mini player (i)');
      });
      
      // ============================================
      // Play/Pause – unchanged
      // ============================================
      if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
      video.addEventListener('click', togglePlayPause);
      
      function togglePlayPause() {
        video.paused ? video.play().catch(function() {}) : video.pause();
      }
      
      video.addEventListener('play', function() {
        if (videoContainer) videoContainer.classList.remove('paused');
        if (playPauseBtn) playPauseBtn.setAttribute('data-tooltip', 'Pause (k)');
      });
      
      video.addEventListener('pause', function() {
        if (videoContainer) videoContainer.classList.add('paused');
        if (playPauseBtn) playPauseBtn.setAttribute('data-tooltip', 'Play (k)');
      });
      
      // ============================================
      // Controls Auto-Hide – unchanged
      // ============================================
      var controlsTimeout = null;
      var controlsVisible = false;
      
      function showControls() {
        if (!videoContainer) return;
        if (!controlsVisible) {
          videoContainer.classList.add('controls-visible');
          controlsVisible = true;
        }
        clearTimeout(controlsTimeout);
        var isFS = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFS || isMobile) {
          controlsTimeout = setTimeout(hideControls, 3000);
        }
      }
      
      function hideControls() {
        if (!videoContainer) return;
        if (isScrubbing || settingsMenuOpen || video.paused) return;
        videoContainer.classList.remove('controls-visible');
        controlsVisible = false;
      }
      
      if (videoContainer) {
        videoContainer.addEventListener('mousemove', showControls, { passive: true });
        
        videoContainer.addEventListener('touchstart', function(e) {
          if (e.target === video || e.target === videoContainer) {
            if (controlsVisible) {
              hideControls();
            } else {
              showControls();
            }
          } else {
            showControls();
          }
        }, { passive: true });
        
        video.addEventListener('pause', function() {
          clearTimeout(controlsTimeout);
          showControls();
        });
        
        video.addEventListener('play', function() {
          var isFS = document.fullscreenElement || document.webkitFullscreenElement;
          if (isFS || isMobile) {
            clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(hideControls, 3000);
          }
        });
        
        videoContainer.addEventListener('mouseleave', function() {
          var isFS = document.fullscreenElement || document.webkitFullscreenElement;
          if (!isFS && !isMobile) {
            clearTimeout(controlsTimeout);
            controlsTimeout = setTimeout(hideControls, 500);
          }
        }, { passive: true });
      }
      
      // ============================================
      // Cleanup – unchanged (plus measurer cleanup already added)
      // ============================================
      window.addEventListener('beforeunload', function() {
        stopBufferMonitoring();
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (streamPlayer) {
          streamType === 'hls' ? streamPlayer.destroy() : streamPlayer.reset();
        }
      });
      
      // Start
      init();
    }
  })();
}