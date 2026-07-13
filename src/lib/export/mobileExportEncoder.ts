import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export class MobileExportEncoder {
  private muxer: Muxer<ArrayBufferTarget>;
  private videoEncoder: VideoEncoder;
  private audioEncoder: AudioEncoder | null = null;
  private frameCount = 0;
  private width: number;
  private height: number;
  private frameRate: number;
  private hasAudio: boolean;

  constructor(width: number, height: number, frameRate: number, hasAudio: boolean) {
    this.width = width;
    this.height = height;
    this.frameRate = frameRate;
    this.hasAudio = hasAudio;

    const muxerOptions: any = {
      target: new ArrayBufferTarget(),
      video: {
        codec: "avc",
        width,
        height,
      },
      fastStart: "in-memory",
    };

    if (hasAudio) {
      muxerOptions.audio = {
        codec: "aac",
        numberOfChannels: 2,
        sampleRate: 48000,
      };
    }

    this.muxer = new Muxer(muxerOptions);

    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (err) => console.error("[MobileExport] VideoEncoder error:", err),
    });

    this.videoEncoder.configure({
      codec: "avc1.640028", // H.264 High Profile (AVC1)
      width,
      height,
      bitrate: 8_000_000,
      framerate: frameRate,
      hardwareAcceleration: "prefer-hardware",
    });

    if (hasAudio) {
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
        error: (err) => console.error("[MobileExport] AudioEncoder error:", err),
      });

      this.audioEncoder.configure({
        codec: "mp4a.40.2", // AAC-LC
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: 128_000,
      });
    }
  }

  async encodeFrame(imageData: ImageData, timestampUs: number): Promise<void> {
    const bitmap = await createImageBitmap(imageData);
    const frame = new VideoFrame(bitmap, { timestamp: timestampUs });
    this.videoEncoder.encode(frame, { keyFrame: this.frameCount % 60 === 0 });
    frame.close();
    bitmap.close();
    this.frameCount++;
  }

  async encodeAudioBuffer(buffer: AudioBuffer): Promise<void> {
    if (!this.audioEncoder) return;

    const sampleRate = buffer.sampleRate;
    const totalFrames = buffer.length;
    const chunkSize = 2048;
    let offset = 0;

    while (offset < totalFrames) {
      const currentChunkSize = Math.min(chunkSize, totalFrames - offset);
      
      const chunkData = new Float32Array(currentChunkSize * 2);
      const ch0 = buffer.getChannelData(0).subarray(offset, offset + currentChunkSize);
      const ch1 = buffer.getChannelData(1).subarray(offset, offset + currentChunkSize);
      
      chunkData.set(ch0, 0);
      chunkData.set(ch1, currentChunkSize);
      
      const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
      
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: sampleRate,
        numberOfFrames: currentChunkSize,
        numberOfChannels: 2,
        timestamp: timestampUs,
        data: chunkData,
      });
      
      this.audioEncoder.encode(audioData);
      audioData.close();
      
      offset += currentChunkSize;
    }
  }

  async finalize(): Promise<Blob> {
    await this.videoEncoder.flush();
    if (this.audioEncoder) {
      await this.audioEncoder.flush();
    }
    this.muxer.finalize();
    return new Blob([this.muxer.target.buffer], { type: "video/mp4" });
  }
}
