# Test Fixtures

This directory contains test video files for the thumbnail engine tests.

## Required Test Video

To run the FFmpeg integration tests, you need to add a short test video:

**File**: `sample.mp4` **Requirements**:

- Duration: 5-10 seconds (short for fast tests)
- Resolution: Any (will be scaled to 160x90)
- Format: MP4 with H.264 codec (most compatible)
- Size: Keep it small (< 1MB recommended)

## How to Create a Test Video

### Option 1: Use FFmpeg to generate a test pattern

```bash
ffmpeg -f lavfi -i testsrc=duration=5:size=1280x720:rate=30 \
  -pix_fmt yuv420p -c:v libx264 sample.mp4
```

This creates a 5-second test pattern video.

### Option 2: Use an existing short video

Copy any short MP4 video you have:

```bash
cp /path/to/your/short/video.mp4 src-tauri/tests/fixtures/sample.mp4
```

### Option 3: Download a sample video

You can use any royalty-free short video from:

- https://sample-videos.com/
- https://file-examples.com/

## What Tests Use This

The following tests require `sample.mp4`:

1. **test_extract_single_frame_returns_valid_webp** - Verifies FFmpeg extraction produces valid WebP files
2. **test_extract_frame_beyond_duration_returns_error** - Tests out-of-bounds timestamp handling

If the file doesn't exist, these tests will be skipped with a warning message.

## .gitignore

Test videos are excluded from git (see `.gitignore`) to keep the repository size small. Each developer should add their own test video locally.
