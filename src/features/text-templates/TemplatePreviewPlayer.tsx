import React, {
  useEffect, useRef, useImperativeHandle,
  forwardRef, useState
} from 'react';
import { TemplateRenderer, TextTemplate } from '@clypra/engine';

export interface TemplatePreviewPlayerHandle {
  play:        () => void;
  pause:       () => void;
  stop:        () => void;
  goToFrame:   (frame: number) => void;
  getAnimation: () => any;
}

export interface TemplatePreviewPlayerProps {
  lottieData:   any | null; // Represents TextTemplate payload
  autoplay?:    boolean;
  loop?:        boolean;
  speed?:       number;
  initialFrame?: number;
  width?:       number | string;
  height?:      number | string;
  onReady?:     () => void;
  onComplete?:  () => void;
  onError?:     (error: string) => void;
  className?:   string;
  onFrameChange?: (currentFrame: number, totalFrames: number) => void;
}

export const TemplatePreviewPlayer = forwardRef<TemplatePreviewPlayerHandle, TemplatePreviewPlayerProps>(
  ({
    lottieData: template,
    autoplay  = true,
    loop      = true,
    speed     = 1,
    initialFrame,
    width     = '100%',
    height    = '100%',
    onReady,
    onComplete,
    onError,
    className,
    onFrameChange,
  }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(autoplay);
    const [currentTime, setCurrentTime] = useState(0);
    const requestRef = useRef<number | null>(null);
    const previousTimeRef = useRef<number | null>(null);

    const onReadyRef = useRef(onReady);
    const onCompleteRef = useRef(onComplete);
    const onFrameChangeRef = useRef(onFrameChange);

    useEffect(() => {
      onReadyRef.current = onReady;
      onCompleteRef.current = onComplete;
      onFrameChangeRef.current = onFrameChange;
    });

    // Expose Lottie player compatible controller handles
    useImperativeHandle(ref, () => ({
      play: () => {
        setIsPlaying(true);
      },
      pause: () => {
        setIsPlaying(false);
      },
      stop: () => {
        setIsPlaying(false);
        setCurrentTime(0);
      },
      goToFrame: (frame: number) => {
        setIsPlaying(false);
        if (template) {
          const fps = template.fps || 30;
          setCurrentTime(frame / fps);
        }
      },
      getAnimation: () => ({
        totalFrames: template ? Math.round(template.duration * (template.fps || 30)) : 0,
        frameRate: template?.fps || 30,
        isLoaded: !!template,
      }),
    }));

    // Trigger ready callback on mount if data is present
    useEffect(() => {
      if (template) {
        onReadyRef.current?.();
      }
    }, [template]);

    // Apply initial frame once template is loaded
    useEffect(() => {
      if (template && initialFrame !== undefined) {
        const fps = template.fps || 30;
        setCurrentTime(initialFrame / fps);
      }
    }, [template, initialFrame]);

    // Redraw loop
    useEffect(() => {
      if (!template || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const renderer = new TemplateRenderer(template);
      renderer.drawFrame(ctx, currentTime);

      // Fire frame updates
      const fps = template.fps || 30;
      const totalFrames = Math.round(template.duration * fps);
      const currentFrame = Math.round(currentTime * fps);
      onFrameChangeRef.current?.(currentFrame, totalFrames);
    }, [template, currentTime]);

    // Animation Tick
    const tick = (timestamp: number) => {
      if (previousTimeRef.current !== null && template) {
        const elapsed = (timestamp - previousTimeRef.current) / 1000;
        const nextTime = currentTime + elapsed * speed;
        
        if (nextTime >= template.duration) {
          if (loop) {
            setCurrentTime(0);
          } else {
            setIsPlaying(false);
            onCompleteRef.current?.();
          }
        } else {
          setCurrentTime(nextTime);
        }
      }
      previousTimeRef.current = timestamp;
      requestRef.current = requestAnimationFrame(tick);
    };

    useEffect(() => {
      if (isPlaying) {
        previousTimeRef.current = null;
        requestRef.current = requestAnimationFrame(tick);
      } else {
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }
      }
      return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
    }, [isPlaying, currentTime, speed, template]);

    if (!template) {
      return (
        <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666677', fontSize: 12 }}>
          No template loaded
        </div>
      );
    }

    return (
      <div className={className} style={{ position: 'relative', width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={template.canvasWidth}
          height={template.canvasHeight}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }
);

TemplatePreviewPlayer.displayName = 'TemplatePreviewPlayer';
export default TemplatePreviewPlayer;
