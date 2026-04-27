/**
 * Test setup file for Vitest
 * Configures testing environment and global utilities
 */

import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock AudioContext for tests
class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = "running";

  createGain() {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
  }

  decodeAudioData() {
    return Promise.resolve({
      duration: 1,
      length: 44100,
      numberOfChannels: 2,
      sampleRate: 44100,
    });
  }

  close() {
    return Promise.resolve();
  }

  resume() {
    return Promise.resolve();
  }

  suspend() {
    return Promise.resolve();
  }
}

// @ts-expect-error - Mocking global AudioContext
global.AudioContext = MockAudioContext;
