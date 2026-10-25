import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const TOTAL_FRAMES = 194
const AUDIO_DURATION = 8.08

function getFrameUrl(index: number): string {
  const frameNum = String(index + 1).padStart(4, '0')
  return `/frames/frame_${frameNum}.jpg`
}

export function CinematicScroll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const progressFillRef = useRef<HTMLDivElement>(null)
  const scrollPromptRef = useRef<HTMLDivElement>(null)

  // Wrapper overlay & CTA refs
  const [isWrapperDismissed, setIsWrapperDismissed] = useState<boolean>(false)
  const [isWrapperImgReady, setIsWrapperImgReady] = useState<boolean>(false)
  const [isCrashing, setIsCrashing] = useState<boolean>(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ctaBtnRef = useRef<HTMLButtonElement>(null)
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null)

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isAudioActiveRef = useRef<boolean>(false)
  const [isAudioActive, setIsAudioActive] = useState<boolean>(false)
  const scrollStopTimerRef = useRef<number | null>(null)
  const maxAllowedAudioTimeRef = useRef<number>(0)

  // Toggle Sound with browser gesture handling
  const toggleAudio = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isAudioActiveRef.current) {
      audio.pause()
      isAudioActiveRef.current = false
      setIsAudioActive(false)
    } else {
      audio.muted = false
      const duration = audio.duration || AUDIO_DURATION
      const targetTime = (currentFrameRef.current / (TOTAL_FRAMES - 1)) * duration
      audio.currentTime = targetTime
      maxAllowedAudioTimeRef.current = targetTime
      isAudioActiveRef.current = true
      setIsAudioActive(true)
    }
  }

  // Crash animation when user clicks the CTA on the wrapper
  const handleWrapperCtaClick = () => {
    if (isCrashing || isWrapperDismissed) return
    setIsCrashing(true)

    // 1. Activate audio on this user gesture
    if (audioRef.current) {
      audioRef.current.muted = false
      audioRef.current.currentTime = 0
      maxAllowedAudioTimeRef.current = 0
    }
    isAudioActiveRef.current = true
    setIsAudioActive(true)

    // 2. Animate and crash wrapper like a lays packet wrapper and vanish
    if (!wrapperRef.current) {
      setIsWrapperDismissed(true)
      document.body.style.overflow = ''
      return
    }

    const tl = gsap.timeline({
      onComplete: () => {
        setIsWrapperDismissed(true)
        document.body.style.overflow = ''
      },
    })

    // Squeeze button in
    if (ctaBtnRef.current) {
      tl.to(ctaBtnRef.current, {
        scale: 0.9,
        duration: 0.08,
        ease: 'power2.in',
      }).to(ctaBtnRef.current, {
        scale: 0,
        opacity: 0,
        duration: 0.16,
        ease: 'back.in(2)',
      })
    }

    // SVG displacement turbulence scale (realistic crinkle creases)
    if (displacementRef.current) {
      tl.to(
        displacementRef.current,
        {
          attr: { scale: 120 },
          duration: 0.5,
          ease: 'power2.in',
        },
        0.08
      )
    }

    // 3D violent crumple and crush into center
    tl.to(
      wrapperRef.current,
      {
        keyframes: [
          { scale: 1.03, rotateZ: 3, rotateX: -8, duration: 0.08 },
          { scale: 0.94, rotateZ: -6, rotateX: 18, skewX: 16, skewY: -12, duration: 0.1 },
          {
            scaleX: 0.35,
            scaleY: 0.28,
            rotateZ: -38,
            rotateX: 65,
            rotateY: 45,
            skewX: 42,
            skewY: -32,
            borderRadius: '40%',
            filter: 'contrast(1.8) brightness(1.25) drop-shadow(0 25px 35px rgba(0,0,0,0.5))',
            duration: 0.35,
          },
          {
            scale: 0.02,
            rotateZ: -125,
            rotateX: 95,
            opacity: 0,
            filter: 'contrast(2.5) brightness(1.6) blur(6px)',
            duration: 0.22,
          },
        ],
        ease: 'power3.in',
      },
      0.08
    )
  }

  // Lock body scroll while wrapper is on top
  useEffect(() => {
    if (!isWrapperDismissed) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isWrapperDismissed])

  // Preload wrapper background image so overlay and CTA appear together immediately
  useEffect(() => {
    const wrapperImg = new Image()
    wrapperImg.src = '/Desktop - 1.jpg'
    if (wrapperImg.complete) {
      queueMicrotask(() => setIsWrapperImgReady(true))
    } else {
      wrapperImg.onload = () => setIsWrapperImgReady(true)
      wrapperImg.onerror = () => setIsWrapperImgReady(true)
    }
  }, [])

  // Internal state kept in refs to avoid any React re-renders during scroll
  const currentFrameRef = useRef<number>(0)
  const lastRenderedIndexRef = useRef<number>(-1)
  const rafIdRef = useRef<number | null>(null)
  const imagesCacheRef = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES).fill(null))
  const loadingIndicesRef = useRef<Set<number>>(new Set())
  const isDestroyedRef = useRef<boolean>(false)

  useEffect(() => {
    isDestroyedRef.current = false
    const imagesCache = imagesCacheRef.current
    const loadingIndices = loadingIndicesRef.current

    // Initialize audio element
    const audio = new Audio('/audio.mp3')
    audio.preload = 'auto'
    audio.loop = false
    audioRef.current = audio

    // Hard ceiling: pause immediately if audio reaches the current scroll position
    const onTimeUpdate = () => {
      const a = audioRef.current
      if (!a) return
      if (a.currentTime >= maxAllowedAudioTimeRef.current) {
        a.pause()
      }
    }
    audio.addEventListener('timeupdate', onTimeUpdate)

    // Mobile config for GSAP
    ScrollTrigger.config({
      ignoreMobileResize: true,
    })

    const isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 768)

    // Helper to find closest loaded frame if the target frame is still loading
    const getNearestLoadedFrame = (targetIndex: number): HTMLImageElement | null => {
      if (imagesCache[targetIndex]) {
        return imagesCache[targetIndex]
      }
      const lastRendered = lastRenderedIndexRef.current
      if (lastRendered >= 0 && imagesCache[lastRendered]) {
        return imagesCache[lastRendered]
      }
      let closestIdx = -1
      let minDistance = Infinity
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        if (imagesCache[i]) {
          const dist = Math.abs(i - targetIndex)
          if (dist < minDistance) {
            minDistance = dist
            closestIdx = i
          }
        }
      }
      return closestIdx !== -1 ? imagesCache[closestIdx] : null
    }

    // Render frame to canvas with high-DPI and object-fit: contain logic
    const renderFrame = (targetIndex: number) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return

      const img = getNearestLoadedFrame(targetIndex)
      if (!img) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const displayW = canvas.clientWidth
      const displayH = canvas.clientHeight

      if (displayW === 0 || displayH === 0) return

      const targetBufferW = Math.round(displayW * dpr)
      const targetBufferH = Math.round(displayH * dpr)

      if (canvas.width !== targetBufferW || canvas.height !== targetBufferH) {
        canvas.width = targetBufferW
        canvas.height = targetBufferH
      }

      ctx.save()
      ctx.scale(dpr, dpr)

      // Pure plain white canvas background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, displayW, displayH)

      // Aspect ratio contain calculation (1920 x 1080)
      const imgW = img.naturalWidth || 1920
      const imgH = img.naturalHeight || 1080
      const imgRatio = imgW / imgH
      const canvasRatio = displayW / displayH

      let renderW: number
      let renderH: number

      if (canvasRatio > imgRatio) {
        renderH = displayH
        renderW = displayH * imgRatio
      } else {
        renderW = displayW
        renderH = displayW / imgRatio
      }

      const renderX = (displayW - renderW) / 2
      const renderY = (displayH - renderH) / 2

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, renderX, renderY, renderW, renderH)

      ctx.restore()
      lastRenderedIndexRef.current = targetIndex
    }

    // Schedule render via requestAnimationFrame
    const scheduleRender = (frameIndex: number) => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        renderFrame(frameIndex)
      })
    }

    // Load individual frame
    const loadFrame = (index: number): Promise<HTMLImageElement | null> => {
      if (index < 0 || index >= TOTAL_FRAMES) return Promise.resolve(null)
      if (imagesCache[index]) return Promise.resolve(imagesCache[index])
      if (loadingIndices.has(index)) return Promise.resolve(null)

      loadingIndices.add(index)

      return new Promise((resolve) => {
        const img = new Image()
        img.src = getFrameUrl(index)

        img.onload = () => {
          if (isDestroyedRef.current) return
          loadingIndices.delete(index)
          imagesCache[index] = img

          if (currentFrameRef.current === index) {
            renderFrame(index)
          } else if (lastRenderedIndexRef.current === -1) {
            renderFrame(index)
          }
          resolve(img)
        }

        img.onerror = () => {
          if (isDestroyedRef.current) return
          loadingIndices.delete(index)
          resolve(null)
        }
      })
    }

    // Prioritize loading frames in a window around center index
    const prioritizeWindow = (centerIndex: number, windowRadius = 10) => {
      const start = Math.max(0, centerIndex - windowRadius)
      const end = Math.min(TOTAL_FRAMES - 1, centerIndex + windowRadius)

      loadFrame(centerIndex)
      for (let r = 1; r <= windowRadius; r++) {
        if (centerIndex + r <= end) loadFrame(centerIndex + r)
        if (centerIndex - r >= start) loadFrame(centerIndex - r)
      }

      // On mobile, purge distant frames to keep memory usage gentle and prevent iOS Safari tab reloads
      if (isMobile) {
        for (let i = 0; i < TOTAL_FRAMES; i++) {
          if (imagesCache[i] && Math.abs(i - centerIndex) > 35) {
            imagesCache[i] = null
          }
        }
      }
    }

    // Start background progressive preload
    const startProgressiveLoading = async () => {
      await loadFrame(0)
      if (isDestroyedRef.current) return

      const initialBatch: Promise<HTMLImageElement | null>[] = []
      for (let i = 1; i <= 24 && i < TOTAL_FRAMES; i++) {
        initialBatch.push(loadFrame(i))
      }
      await Promise.all(initialBatch)
      if (isDestroyedRef.current) return

      let nextIndex = 25
      const loadNextQueue = () => {
        if (isDestroyedRef.current || nextIndex >= TOTAL_FRAMES) return

        const chunk: Promise<HTMLImageElement | null>[] = []
        for (let c = 0; c < 5 && nextIndex < TOTAL_FRAMES; c++, nextIndex++) {
          if (!imagesCache[nextIndex] && !loadingIndices.has(nextIndex)) {
            chunk.push(loadFrame(nextIndex))
          }
        }

        Promise.all(chunk).then(() => {
          if (!isDestroyedRef.current && nextIndex < TOTAL_FRAMES) {
            if ('requestIdleCallback' in window) {
              window.requestIdleCallback(loadNextQueue, { timeout: 120 })
            } else {
              setTimeout(loadNextQueue, 16)
            }
          }
        })
      }

      loadNextQueue()
    }

    startProgressiveLoading()

    // Handle scroll progress
    const onProgressUpdate = (progress: number) => {
      const clampedProgress = Math.max(0, Math.min(1, progress))

      // 1. Draw line strip from left bottom to right bottom
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${clampedProgress * 100}%`
      }

      // Smoothly fade out scroll prompt once scrolling begins
      if (scrollPromptRef.current) {
        const promptOpacity = Math.max(0, 1 - clampedProgress * 20)
        scrollPromptRef.current.style.opacity = promptOpacity.toString()
        scrollPromptRef.current.style.pointerEvents = promptOpacity === 0 ? 'none' : 'auto'
      }

      // 2. Synchronize audio playback strictly with scroll progress and timing
      if (audioRef.current && isAudioActiveRef.current) {
        const audio = audioRef.current
        const duration = audio.duration || AUDIO_DURATION
        const targetTime = Math.max(0, Math.min(duration, clampedProgress * duration))

        maxAllowedAudioTimeRef.current = targetTime

        // If user scrolled backwards or scrubbed ahead, seek directly
        if (targetTime < audio.currentTime || Math.abs(audio.currentTime - targetTime) > 0.22) {
          audio.currentTime = targetTime
        }

        // Play ONLY while scrolling and within animation bounds
        if (clampedProgress > 0.005 && clampedProgress < 0.995) {
          if (audio.currentTime < targetTime) {
            if (audio.paused) {
              audio.play().catch(() => {})
            }
          }
        } else {
          audio.pause()
          if (clampedProgress <= 0.005) {
            audio.currentTime = 0
          }
        }

        // Immediately pause as soon as scrolling stops
        if (scrollStopTimerRef.current !== null) {
          clearTimeout(scrollStopTimerRef.current)
        }
        scrollStopTimerRef.current = window.setTimeout(() => {
          if (audio && !audio.paused) {
            audio.pause()
          }
        }, 75)
      }

      // 3. Map normalized scroll progress [0, 1] onto frame indices [0, 193]
      const targetFrame = Math.min(
        TOTAL_FRAMES - 1,
        Math.max(0, Math.round(clampedProgress * (TOTAL_FRAMES - 1)))
      )

      currentFrameRef.current = targetFrame

      // 4. Prioritize loading upcoming and nearby frames
      prioritizeWindow(targetFrame, 10)

      // 5. Draw frame
      scheduleRender(targetFrame)
    }

    // GSAP ScrollTrigger configuration
    const gsapContext = gsap.context(() => {
      if (!containerRef.current || !viewportRef.current) return

      const trigger = ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: 'bottom bottom',
        pin: viewportRef.current,
        pinSpacing: false,
        anticipatePin: 1,
        onUpdate: (self) => {
          onProgressUpdate(self.progress)
        },
      })

      onProgressUpdate(trigger.progress)
    })

    // Resize observer to adjust canvas buffer and redraw smoothly
    const resizeObserver = new ResizeObserver(() => {
      renderFrame(currentFrameRef.current)
      ScrollTrigger.refresh()
    })

    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current)
    }

    const handleResize = () => {
      renderFrame(currentFrameRef.current)
      ScrollTrigger.refresh()
    }

    const handleOrientation = () => {
      setTimeout(() => {
        renderFrame(currentFrameRef.current)
        ScrollTrigger.refresh()
      }, 100)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleOrientation)

    return () => {
      isDestroyedRef.current = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeEventListener('timeupdate', onTimeUpdate)
        audioRef.current.src = ''
      }
      if (scrollStopTimerRef.current !== null) {
        clearTimeout(scrollStopTimerRef.current)
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleOrientation)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      gsapContext.revert()
    }
  }, [])

  return (
    <>
      {/* SVG Crinkle Displacement Filter for realistic chip packet wrapper crush */}
      <svg
        className="wrapper-filter-svg"
        aria-hidden="true"
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter id="crinkle-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035 0.05"
              numOctaves="4"
              result="noise"
            />
            <feDisplacementMap
              ref={displacementRef}
              in="SourceGraphic"
              in2="noise"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Top Fullscreen Wrapper Overlay */}
      {!isWrapperDismissed && (
        <div
          ref={wrapperRef}
          className={`wrapper-overlay ${isWrapperImgReady ? 'ready' : 'loading'}`}
        >
          <button
            ref={ctaBtnRef}
            type="button"
            className="wrapper-cta-btn"
            onClick={handleWrapperCtaClick}
          >
            FEEL THE RUSH
          </button>
        </div>
      )}

      {/* Main Cinematic Scroll Track */}
      <div ref={containerRef} className="scroll-track">
        <div ref={viewportRef} className="cinematic-viewport">
          {/* Cinematic Canvas with High-Key White Background Filter */}
          <canvas ref={canvasRef} className="cinematic-canvas" />

          {/* Minimal Clean Header with Sound Toggle */}
          <header className="brand-header">
            <h1 className="brand-title">RED BULL</h1>

            <button
              type="button"
              className={`sound-toggle ${isAudioActive ? 'active' : 'muted'}`}
              onClick={toggleAudio}
              aria-label={isAudioActive ? 'Mute audio' : 'Enable audio'}
            >
              <span className="sound-visualizer" aria-hidden="true">
                <span className="sound-bar" />
                <span className="sound-bar" />
                <span className="sound-bar" />
              </span>
              <span className="sound-text">
                {isAudioActive ? 'AUDIO // ON' : 'AUDIO // OFF'}
              </span>
            </button>
          </header>

          {/* Subtle Scroll Hint */}
          <div ref={scrollPromptRef} className="scroll-hint">
            <span className="scroll-hint-dot" />
            <span className="scroll-hint-text">SCROLL TO EXPERIENCE</span>
          </div>

          {/* Line strip drawing progressively from left bottom to right bottom using line-1.png */}
          <div className="line-strip-container" aria-hidden="true">
            <div ref={progressFillRef} className="line-strip-fill">
              <div className="line-strip-pattern" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
