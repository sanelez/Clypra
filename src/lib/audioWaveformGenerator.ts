/**
 * Audio Waveform Thumbnail Generator
 *
 * Generates static waveform images for audio file thumbnails
 * Similar to CapCut's audio preview thumbnails in the media panel
 */

export interface WaveformOptions {
  width?: number;
  height?: number;
  barCount?: number;
  barColor?: string;
  backgroundColor?: string;
  barGap?: number;
}

/**
 * Generate a waveform thumbnail from an audio file
 * Returns a base64 data URL that can be used as an image source
 */
export async function generateAudioWaveform(audioPath: string, options: WaveformOptions = {}): Promise<string> {
  const {
    width = 160,
    height = 90,
    barCount = 32,
    barColor = "#22d3ee", // cyan-400
    backgroundColor = "#1e293b", // slate-800
    barGap = 0.2,
  } = options;

  return new Promise((resolve, reject) => {
    // Create audio element
    const audio = new Audio(audioPath);

    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    audio.addEventListener("loadedmetadata", async () => {
      try {
        // Fetch audio data
        const response = await fetch(audioPath);
        const arrayBuffer = await response.arrayBuffer();

        // Decode audio data
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get channel data (use first channel)
        const channelData = audioBuffer.getChannelData(0);

        // Calculate samples per bar
        const samplesPerBar = Math.floor(channelData.length / barCount);

        // Calculate bar amplitudes
        const barAmplitudes: number[] = [];
        for (let i = 0; i < barCount; i++) {
          const start = i * samplesPerBar;
          const end = start + samplesPerBar;

          // Calculate RMS (root mean square) for this segment
          let sum = 0;
          for (let j = start; j < end && j < channelData.length; j++) {
            sum += channelData[j] * channelData[j];
          }
          const rms = Math.sqrt(sum / samplesPerBar);
          barAmplitudes.push(rms);
        }

        // Normalize amplitudes to 0-1 range
        const maxAmplitude = Math.max(...barAmplitudes);
        const normalizedAmplitudes = barAmplitudes.map((amp) => amp / maxAmplitude);

        // Create canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Draw bars
        const barWidth = width / barCount;
        const actualBarWidth = barWidth * (1 - barGap);
        const barGapPx = barWidth * barGap;

        ctx.fillStyle = barColor;

        for (let i = 0; i < barCount; i++) {
          const amplitude = normalizedAmplitudes[i];
          const minHeight = 2;
          const maxHeight = height * 0.8;
          const barHeight = Math.max(minHeight, amplitude * maxHeight);

          const x = i * barWidth + barGapPx / 2;
          const y = (height - barHeight) / 2;

          // Draw rounded rectangle
          ctx.beginPath();
          ctx.roundRect(x, y, actualBarWidth, barHeight, 1);
          ctx.fill();
        }

        // Convert to data URL
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);

        // Cleanup
        audioContext.close();
      } catch (err) {
        reject(err);
      }
    });

    audio.addEventListener("error", (err) => {
      reject(new Error(`Failed to load audio: ${err}`));
    });

    // Start loading
    audio.load();
  });
}

/**
 * Generate a simple waveform pattern (for when audio analysis fails)
 * Uses a pseudo-random pattern that looks like an audio waveform
 */
export function generateSimpleWaveform(options: WaveformOptions = {}): string {
  const { width = 160, height = 90, barCount = 32, barColor = "#22d3ee", backgroundColor = "#1e293b", barGap = 0.2 } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Draw bars with pseudo-random heights
  const barWidth = width / barCount;
  const actualBarWidth = barWidth * (1 - barGap);
  const barGapPx = barWidth * barGap;

  ctx.fillStyle = barColor;

  for (let i = 0; i < barCount; i++) {
    // Generate pseudo-random height (looks like audio waveform)
    const seed = Math.sin(i * 0.5) * 0.5 + 0.5;
    const minHeight = 2;
    const maxHeight = height * 0.6;
    const barHeight = Math.max(minHeight, seed * maxHeight);

    const x = i * barWidth + barGapPx / 2;
    const y = (height - barHeight) / 2;

    ctx.beginPath();
    ctx.roundRect(x, y, actualBarWidth, barHeight, 1);
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}
