# Clypra

A modern video editor built with Tauri, React, and TypeScript featuring a CapCut-style timeline interface.

## Features

- 🎬 **Video Import** - Support for MP4, MOV, WebM, MKV, M4V, and AVI formats
- ✂️ **Trim & Export** - Precise video trimming with visual timeline
- 📊 **Audio Waveform** - Real-time audio visualization
- 🎞️ **Filmstrip Preview** - Thumbnail strip for easy navigation
- 🎯 **CapCut-Style Timeline** - Professional timeline with ruler, tracks, and playhead
- ⚡ **Fast Processing** - FFmpeg-powered video processing
- 🖥️ **Native Performance** - Built with Tauri for desktop performance

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Generic UI (icons, buttons, etc.)
│   └── video/          # Video-specific components
├── features/           # Feature modules
│   └── timeline/       # Timeline feature
│       ├── components/ # Timeline UI components
│       ├── hooks/      # Timeline hooks
│       └── utils/      # Timeline utilities
├── lib/                # Shared utilities
├── types/              # TypeScript types
├── constants/          # App constants
└── App.tsx             # Main app component
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Rust and Cargo
- FFmpeg (for video processing)

**Install FFmpeg:**

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
npm run tauri build
```

## Development

### Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build frontend
- `npm run preview` - Preview production build
- `npm run tauri dev` - Run Tauri app in development
- `npm run tauri build` - Build Tauri app for production

### Tech Stack

**Frontend:**

- React 19
- TypeScript
- Tailwind CSS 4
- Vite 7

**Backend:**

- Tauri 2
- Rust
- FFmpeg (via CLI)

## Usage

1. **Import Video** - Click "Import video" to select a video file
2. **Preview** - Use the video player controls to preview your video
3. **Trim** - Adjust trim start/end times using the timeline or input fields
4. **Export** - Click "Export trim" to save the trimmed video

### Keyboard Shortcuts

- `Space` - Play/Pause video
- `Ctrl/Cmd + Scroll` - Zoom timeline (trackpad pinch-to-zoom)

## Architecture Highlights

### Feature-Based Organization

The codebase is organized by features rather than file types, making it easy to understand and maintain:

- **Timeline Feature** - Self-contained module with components, hooks, and utilities
- **Shared Libraries** - Common utilities used across features
- **Type Safety** - Full TypeScript coverage with shared type definitions

### Clean Separation of Concerns

- **Components** - Pure UI rendering
- **Hooks** - Reusable stateful logic
- **Utils** - Pure functions for data transformation
- **Constants** - Configuration and theme values

### Performance Optimizations

- Memoized calculations for timeline rendering
- Canvas-based waveform for efficient visualization
- Async filmstrip generation to avoid blocking UI
- Proper cleanup to prevent memory leaks

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Follow the existing code structure and patterns
2. Keep features self-contained in `src/features/`
3. Add shared utilities to `src/lib/`
4. Update types in `src/types/`
5. Document new features in their respective README files

## License

This project is licensed under the MIT License.

## Acknowledgments

- Timeline design inspired by CapCut
- Built with [Tauri](https://tauri.app)
- Video processing powered by [FFmpeg](https://ffmpeg.org)
