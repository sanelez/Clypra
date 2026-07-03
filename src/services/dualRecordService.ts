import { platform } from "@/core/platform";

export interface DualRecordOptions {
  audio: boolean;
  webcam: boolean;
  screen: boolean;
  /** Optional specific audio input device id (from enumerateAudioDevices) */
  audioDeviceId?: string;
  /** Optional screen capture surface preference */
  screenType?: "entire" | "window";
}

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export class DualRecordService {
  private static instance: DualRecordService | null = null;

  // Recording streams
  private screenStream: MediaStream | null = null;
  private webcamStream: MediaStream | null = null;

  // Separate recorders for screen and camera
  private screenRecorder: MediaRecorder | null = null;
  private webcamRecorder: MediaRecorder | null = null;
  private screenChunks: Blob[] = [];
  private webcamChunks: Blob[] = [];

  private isRecordingActive = false;
  private isPreviewActive = false;

  // Microphone testing
  private micTestStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micLevelBuffer: Uint8Array | null = null;
  private isMicTestActive = false;

  private constructor() {}

  static getInstance(): DualRecordService {
    if (typeof window !== "undefined") {
      const globalKey = "__DualRecordService_instance__";
      if (!(window as any)[globalKey]) {
        (window as any)[globalKey] = new DualRecordService();
      }
      return (window as any)[globalKey];
    }

    if (!DualRecordService.instance) {
      DualRecordService.instance = new DualRecordService();
    }
    return DualRecordService.instance;
  }

  isRecording(): boolean {
    return this.isRecordingActive;
  }

  isMicTesting(): boolean {
    return this.isMicTestActive;
  }

  /**
   * Returns the raw webcam stream — use this for the live preview <video> element.
   */
  getWebcamStream(): MediaStream | null {
    return this.webcamStream;
  }

  getScreenStream(): MediaStream | null {
    return this.screenStream;
  }

  // ─── Device Enumeration ──────────────────────────────────────────────────────

  /**
   * Returns all available audio input devices (built-in, USB, Bluetooth, etc).
   */
  async enumerateAudioDevices(): Promise<AudioDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));
  }

  // ─── Microphone Test ─────────────────────────────────────────────────────────

  /**
   * Start mic level monitoring for a specific device.
   */
  async startMicTest(deviceId?: string): Promise<void> {
    this.stopMicTest();

    // Use the existing webcam/mic preview stream if it exists and has audio
    let stream = this.webcamStream;
    const hasAudio = stream && stream.getAudioTracks().length > 0;

    if (!hasAudio) {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };

      try {
        this.micTestStream = await navigator.mediaDevices.getUserMedia(constraints);
        stream = this.micTestStream;
      } catch (err) {
        console.error("[DualRecordService] Failed to start mic test getUserMedia:", err);
        this.stopMicTest();
        throw err;
      }
    }

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.micSourceNode = this.audioContext.createMediaStreamSource(stream!);
      this.micSourceNode.connect(this.analyserNode);

      this.micLevelBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.isMicTestActive = true;
    } catch (err) {
      console.error("[DualRecordService] Failed to start mic test AudioContext setup:", err);
      this.stopMicTest();
      throw err;
    }
  }

  /**
   * Returns current microphone level (amplitude range: 0.0 - 1.0).
   */
  getMicLevel(): number {
    if (!this.isMicTestActive || !this.analyserNode || !this.micLevelBuffer) return 0;
    this.analyserNode.getByteFrequencyData(this.micLevelBuffer);
    let sum = 0;
    for (let i = 0; i < this.micLevelBuffer.length; i++) {
      sum += this.micLevelBuffer[i];
    }
    const average = sum / this.micLevelBuffer.length;
    return Math.min(1.0, average / 128.0);
  }

  /** Stop microphone test and release streams. */
  stopMicTest(): void {
    this.isMicTestActive = false;
    if (this.micSourceNode) {
      this.micSourceNode.disconnect();
      this.micSourceNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode = null;
    }
    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close().catch(() => {});
      }
      this.audioContext = null;
    }
    if (this.micTestStream) {
      this.micTestStream.getTracks().forEach((t) => t.stop());
      this.micTestStream = null;
    }
    this.micLevelBuffer = null;
  }

  // ─── Camera Preview ──────────────────────────────────────────────────────────

  /**
   * Start preview of the webcam camera.
   */
  async startPreview(
    options: Pick<DualRecordOptions, "webcam" | "audio">,
    audioDeviceId?: string
  ): Promise<MediaStream> {
    if (this.isRecordingActive) return this.webcamStream!;

    if (this.webcamStream) {
      this.stopWebcamStream();
    }

    const audioConstraints = options.audio
      ? audioDeviceId
        ? { deviceId: { exact: audioDeviceId } }
        : true
      : false;

    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: options.webcam
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          : false,
        audio: audioConstraints,
      });
      this.isPreviewActive = true;
      return this.webcamStream;
    } catch (err) {
      console.error("[DualRecordService] startPreview failed:", err);
      this.stopWebcamStream();
      throw err;
    }
  }

  /** Stop preview camera. */
  stopPreview(): void {
    if (!this.isRecordingActive) {
      this.stopWebcamStream();
      this.isPreviewActive = false;
    }
  }

  /**
   * Start preview of the screen share.
   */
  async startScreenPreview(screenType?: "entire" | "window"): Promise<MediaStream> {
    if (this.screenStream) return this.screenStream;

    const videoConstraints: any = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    };
    if (screenType === "entire") {
      videoConstraints.displaySurface = "monitor";
    } else if (screenType === "window") {
      videoConstraints.displaySurface = "window";
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: false,
      });
      return this.screenStream;
    } catch (err) {
      console.error("[DualRecordService] startScreenPreview failed:", err);
      this.stopScreenPreview();
      throw err;
    }
  }

  /** Stop preview of the screen share. */
  stopScreenPreview(): void {
    if (!this.isRecordingActive && this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
  }

  // ─── Recording ───────────────────────────────────────────────────────────────

  /**
   * Start recording. Records screen and camera to separate files.
   */
  async startRecording(options: DualRecordOptions): Promise<void> {
    if (this.isRecordingActive) throw new Error("Recording already in progress");

    this.stopMicTest();
    this.stopWebcamStream(); // Stop webcam preview to get a fresh recording stream
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    this.screenChunks = [];
    this.webcamChunks = [];

    const mimePreference = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const selectedMime = mimePreference.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

    try {
      // 1. Screen stream & recorder
      if (options.screen && !this.screenStream) {
        const videoConstraints: any = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        };
        if (options.screenType === "entire") {
          videoConstraints.displaySurface = "monitor";
        } else if (options.screenType === "window") {
          videoConstraints.displaySurface = "window";
        }

        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints,
          audio: false,
        });
      }

      if (this.screenStream && options.screen) {
        this.screenRecorder = new MediaRecorder(
          this.screenStream,
          selectedMime ? { mimeType: selectedMime } : undefined
        );
        this.screenRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.screenChunks.push(e.data);
        };
        this.screenRecorder.start(250);
      }

      // 2. Webcam + mic stream & recorder
      if ((options.webcam || options.audio) && !this.webcamStream) {
        this.webcamStream = await navigator.mediaDevices.getUserMedia({
          video: options.webcam
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            : false,
          audio: options.audio
            ? options.audioDeviceId
              ? { deviceId: { exact: options.audioDeviceId } }
              : true
            : false,
        });
      }

      if (this.webcamStream && (options.webcam || options.audio)) {
        this.webcamRecorder = new MediaRecorder(
          this.webcamStream,
          selectedMime ? { mimeType: selectedMime } : undefined
        );
        this.webcamRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.webcamChunks.push(e.data);
        };
        this.webcamRecorder.start(250);
      }

      this.isRecordingActive = true;
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  /** Stop recording and save screen and webcam as separate files. Returns file paths. */
  async stopRecording(): Promise<{ filePaths: string[] }> {
    if (!this.isRecordingActive) {
      throw new Error("No active recording session");
    }

    try {
      const stopRecorder = (recorder: MediaRecorder | null): Promise<Blob | null> => {
        if (!recorder || recorder.state === "inactive") return Promise.resolve(null);
        return new Promise((resolve) => {
          recorder.onstop = () => {
            const mimeType = recorder.mimeType || "video/webm";
            const chunks = recorder === this.screenRecorder ? this.screenChunks : this.webcamChunks;
            const blob = new Blob(chunks, { type: mimeType });
            resolve(blob);
          };
          recorder.stop();
        });
      };

      const [screenBlob, webcamBlob] = await Promise.all([
        stopRecorder(this.screenRecorder),
        stopRecorder(this.webcamRecorder),
      ]);

      const timestamp = Date.now();
      const filePaths: string[] = [];

      // Save screen recording
      if (screenBlob && screenBlob.size > 0) {
        const mimeType = this.screenRecorder?.mimeType ?? "video/webm";
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const fileName = `screen_${timestamp}.${ext}`;
        const arrayBuffer = await screenBlob.arrayBuffer();
        const path = await platform.saveRecording(fileName, new Uint8Array(arrayBuffer));
        filePaths.push(path);
      }

      // Save camera/audio recording
      if (webcamBlob && webcamBlob.size > 0) {
        const mimeType = this.webcamRecorder?.mimeType ?? "video/webm";
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const fileName = `camera_${timestamp}.${ext}`;
        const arrayBuffer = await webcamBlob.arrayBuffer();
        const path = await platform.saveRecording(fileName, new Uint8Array(arrayBuffer));
        filePaths.push(path);
      }

      return { filePaths };
    } finally {
      this.cleanup();
    }
  }

  private stopWebcamStream(): void {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((t) => t.stop());
      this.webcamStream = null;
    }
  }

  cleanup(): void {
    this.isRecordingActive = false;
    this.isPreviewActive = false;

    this.stopMicTest();

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.stopWebcamStream();

    this.screenRecorder = null;
    this.webcamRecorder = null;
  }

}
