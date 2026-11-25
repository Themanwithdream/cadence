import { useEffect, useRef, useState } from 'react';
import type { AcousticFrame, StudioPhase } from '../types/cadence';
import styles from './VoiceRibbon.module.css';

export interface VoiceRibbonProps {
  acousticFrame: AcousticFrame;
  phase: StudioPhase;
  /** Optional timestamp (Date.now()) of most recent pause bloom to sustain sage ripple */
  lastPauseBloomAt?: number | null;
  /** Optional CSS pixel height of the acoustic ribbon canvas (default 68) */
  height?: number;
  /** Compact visual styling for tighter viewports */
  compact?: boolean;
}

type Rgb = [number, number, number];

const AMBER: Rgb = [217, 160, 74];
const TERRACOTTA: Rgb = [206, 94, 68];
const ALABASTER: Rgb = [246, 243, 236];

const SAGE_DEEP: Rgb = [76, 134, 111];
const SAGE_MID: Rgb = [110, 179, 151];
const SAGE_MIST: Rgb = [208, 238, 225];

const PAUSE_BLOOM_HOLD_MS = 1900;
const POINT_COUNT = 32;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: Rgb, b: Rgb, t: number, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(lerp(a[0], b[0], clamped));
  const g = Math.round(lerp(a[1], b[1], clamped));
  const bl = Math.round(lerp(a[2], b[2], clamped));
  return `rgba(${r}, ${g}, ${bl}, ${alpha.toFixed(3)})`;
}

function sampleWaveform(waveform: number[], u: number): number {
  if (waveform.length === 0) return 0;
  if (waveform.length === 1) return waveform[0] ?? 0;
  const idx = u * (waveform.length - 1);
  const low = Math.floor(idx);
  const high = Math.min(waveform.length - 1, low + 1);
  const frac = idx - low;
  const a = waveform[low] ?? 0;
  const b = waveform[high] ?? 0;
  return a + (b - a) * frac;
}

export function VoiceRibbon({
  acousticFrame,
  phase,
  lastPauseBloomAt = null,
  height = 68,
  compact = false,
}: VoiceRibbonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const frameRef = useRef<AcousticFrame>(acousticFrame);
  const phaseRef = useRef<StudioPhase>(phase);
  const bloomAtRef = useRef<number | null>(lastPauseBloomAt);

  frameRef.current = acousticFrame;
  phaseRef.current = phase;
  bloomAtRef.current = lastPauseBloomAt;

  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = Math.max(160, container.clientWidth);
    let currentHeight = Math.max(48, container.clientHeight || height);
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(160, Math.round(rect.width));
      currentHeight = Math.max(48, Math.round(rect.height || height));
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(currentHeight * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${currentHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) {
        drawFrame(0, true);
      }
    });
    observer.observe(container);

    let smoothLevel = 0.06;
    let smoothSage = 0;
    let wavePhase = 0;
    let ripplePhase = 0;
    const smoothSamples = new Array<number>(POINT_COUNT).fill(0);
    let rafId: number | null = null;
    let lastTime = performance.now();

    const drawRibbonStrand = (
      points: Array<{ x: number; y: number }>,
      strokeStyle: string,
      lineWidth: number,
      fillStyle?: string,
      glowColor?: string,
      glowBlur = 0,
    ) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      const first = points[0]!;
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < points.length - 1; i += 1) {
        const curr = points[i]!;
        const next = points[i + 1]!;
        const midX = (curr.x + next.x) * 0.5;
        const midY = (curr.y + next.y) * 0.5;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      }

      const last = points[points.length - 1]!;
      ctx.lineTo(last.x, last.y);

      if (fillStyle) {
        ctx.save();
        ctx.lineTo(width, currentHeight * 0.5);
        ctx.lineTo(0, currentHeight * 0.5);
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.restore();
      }

      if (glowColor && glowBlur > 0) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowBlur;
      }

      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };

    const drawFrame = (dtSec: number, isStatic: boolean) => {
      const af = frameRef.current;
      const currentPhase = phaseRef.current;
      const bloomAt = bloomAtRef.current;

      const recentBloom =
        bloomAt !== null && Date.now() - bloomAt < PAUSE_BLOOM_HOLD_MS && currentPhase === 'live';
      const pauseActive = af.inPowerPause || af.inDynamicSilence || recentBloom;

      const targetSage = pauseActive ? 1 : 0;
      const rawLevel = Math.max(0, Math.min(1, af.normalizedLevel || af.rms || 0));
      const idleFloor = currentPhase === 'live' ? 0.08 : 0.045;
      const targetLevel = pauseActive
        ? 0.14
        : Math.max(idleFloor, af.isSpeaking ? Math.min(1, rawLevel * 1.18 + 0.12) : rawLevel * 0.75);

      if (isStatic) {
        smoothLevel = targetLevel;
        smoothSage = targetSage;
      } else {
        const dtFactor = Math.min(1, dtSec * 60);
        smoothLevel = lerp(smoothLevel, targetLevel, 0.14 * dtFactor);
        smoothSage = lerp(smoothSage, targetSage, 0.075 * dtFactor);
        const speed = lerp(2.1 + smoothLevel * 3.8, 1.05, smoothSage);
        wavePhase += dtSec * speed;
        ripplePhase += dtSec * (pauseActive ? 0.85 : 0.35);
      }

      // Smooth waveform samples
      const wf = af.waveform;
      for (let i = 0; i < POINT_COUNT; i += 1) {
        const u = i / (POINT_COUNT - 1);
        const rawSample = sampleWaveform(wf, u);
        smoothSamples[i] = isStatic
          ? rawSample
          : lerp(smoothSamples[i] ?? 0, rawSample, 0.22);
      }

      ctx.clearRect(0, 0, width, currentHeight);

      const midY = currentHeight * 0.5;
      const maxAmp = currentHeight * 0.38;

      // Subtle atmospheric center glow responding to voice / eucalyptus pause
      const radialRadius = Math.max(width * 0.32, currentHeight * 1.8);
      const glowGrad = ctx.createRadialGradient(
        width * 0.5,
        midY,
        4,
        width * 0.5,
        midY,
        radialRadius,
      );
      const centerAlpha = lerp(0.06 + smoothLevel * 0.16, 0.24, smoothSage);
      glowGrad.addColorStop(0, lerpColor(TERRACOTTA, SAGE_MID, smoothSage, centerAlpha));
      glowGrad.addColorStop(0.55, lerpColor(AMBER, SAGE_DEEP, smoothSage, centerAlpha * 0.35));
      glowGrad.addColorStop(1, 'rgba(26, 25, 23, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, currentHeight);

      // Subtle studio acoustic reference axis
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(14, midY);
      ctx.lineTo(width - 14, midY);
      ctx.strokeStyle = lerpColor([246, 243, 236], SAGE_MIST, smoothSage, 0.09);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Tranquil expanding eucalyptus ripples when Power Pause / Dynamic Silence blooms
      if (smoothSage > 0.04 && !isStatic) {
        for (let r = 0; r < 2; r += 1) {
          const progress = (ripplePhase + r * 0.5) % 1;
          const rx = width * (0.08 + progress * 0.38);
          const ry = currentHeight * (0.14 + progress * 0.32);
          const alpha = Math.sin(progress * Math.PI) * 0.28 * smoothSage;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(width * 0.5, midY, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(143, 210, 181, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Compute 3 organic wave strands
      const strandA: Array<{ x: number; y: number }> = [];
      const strandB: Array<{ x: number; y: number }> = [];
      const strandC: Array<{ x: number; y: number }> = [];

      const activeEnergy = lerp(smoothLevel, 0.24, smoothSage * 0.72);
      const voiceWeight = lerp(0.68, 0.14, smoothSage);

      for (let i = 0; i < POINT_COUNT; i += 1) {
        const u = i / (POINT_COUNT - 1);
        const x = u * width;
        const envelope = Math.pow(Math.sin(u * Math.PI), 1.42);
        const sample = (smoothSamples[i] ?? 0) * voiceWeight;

        // Strand A: broad warm amber / deep sage back silk
        const hA =
          Math.sin(u * Math.PI * 2.6 - wavePhase * 0.78) * 0.55 +
          Math.sin(u * Math.PI * 5.2 + wavePhase * 0.45) * 0.22;
        const yA = midY + (hA * (0.28 + activeEnergy * 0.78) + sample * 0.42) * maxAmp * envelope;
        strandA.push({ x, y: yA });

        // Strand B: terracotta / eucalyptus mid voice ribbon
        const hB =
          Math.sin(u * Math.PI * 3.8 + wavePhase * 1.12 + 1.1) * 0.52 +
          Math.cos(u * Math.PI * 6.5 - wavePhase * 0.62) * 0.2;
        const yB = midY + (hB * (0.24 + activeEnergy * 0.9) - sample * 0.62) * maxAmp * envelope;
        strandB.push({ x, y: yB });

        // Strand C: crisp luminous alabaster / mist lead filament
        const hC =
          Math.sin(u * Math.PI * 3.1 + wavePhase * 1.38 + 2.3) * 0.44 +
          Math.sin(u * Math.PI * 7.4 + wavePhase * 0.92) * 0.18;
        const yC = midY + (hC * (0.18 + activeEnergy * 0.95) + sample * 0.92) * maxAmp * envelope;
        strandC.push({ x, y: yC });
      }

      // Draw back silk aura with soft translucent fill
      drawRibbonStrand(
        strandA,
        lerpColor(AMBER, SAGE_DEEP, smoothSage, 0.42),
        2.2,
        lerpColor(AMBER, SAGE_DEEP, smoothSage, 0.08 + smoothSage * 0.05),
      );

      // Draw middle terracotta-amber / sage voice strand
      drawRibbonStrand(
        strandB,
        lerpColor(TERRACOTTA, SAGE_MID, smoothSage, 0.76),
        1.85,
        lerpColor(TERRACOTTA, SAGE_MID, smoothSage, 0.06),
      );

      // Draw foreground luminous warm alabaster filament
      drawRibbonStrand(
        strandC,
        lerpColor(ALABASTER, SAGE_MIST, smoothSage, 0.94),
        2.1,
        undefined,
        lerpColor(ALABASTER, SAGE_MIST, smoothSage, 0.42),
        7,
      );
    };

    if (reducedMotion) {
      drawFrame(0, true);
      const interval = window.setInterval(() => drawFrame(0, true), 180);
      return () => {
        window.clearInterval(interval);
        observer.disconnect();
      };
    }

    const tick = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      drawFrame(dtSec, false);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [height, reducedMotion]);

  const pauseStateLabel = acousticFrame.inDynamicSilence
    ? 'Dynamic Silence'
    : acousticFrame.inPowerPause
      ? 'Power Pause'
      : phase === 'live'
        ? acousticFrame.isSpeaking
          ? 'Voiced'
          : 'Breathing'
        : phase === 'countdown'
          ? 'Calibrating'
          : 'Acoustic Ready';

  const isPauseVisual = acousticFrame.inPowerPause || acousticFrame.inDynamicSilence;

  return (
    <div
      ref={containerRef}
      className={`${styles.ribbonShell} ${compact ? styles.compact : ''} ${
        isPauseVisual ? styles.ribbonPause : ''
      }`}
      style={{ height: `${height}px` }}
      aria-label={`Voice cadence ribbon: ${pauseStateLabel}`}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <span
        className={`${styles.whisperTag} ${isPauseVisual ? styles.whisperTagPause : ''}`}
        aria-hidden="true"
      >
        {pauseStateLabel}
      </span>
    </div>
  );
}
