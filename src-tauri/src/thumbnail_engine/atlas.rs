//! Tile-based thumbnail atlas system
//!
//! Instead of storing one image per timestamp (which causes filesystem fragmentation
//! and poor I/O performance), we pack multiple thumbnails into sprite sheets/atlases.
//!
//! ## Architecture
//!
//! ```text
//! Old (per-frame):
//! video_abc_low_1000_1x.webp    ← 1 thumbnail
//! video_abc_low_2000_1x.webp    ← 1 thumbnail
//! video_abc_low_3000_1x.webp    ← 1 thumbnail
//! ... (thousands of files)
//!
//! New (atlas):
//! video_abc_low_tile_0001.webp  ← 32 thumbnails (4×8 grid)
//! video_abc_low_tile_0002.webp  ← 32 thumbnails
//! ... (far fewer files)
//! ```
//!
//! ## Benefits
//!
//! - **Fewer files**: 32x reduction in file count
//! - **Fewer I/O ops**: Read 32 thumbnails in one disk read
//! - **Better OS caching**: Larger files stay in page cache longer
//! - **Less fragmentation**: Fewer inodes, better disk layout
//! - **Faster GPU upload**: Batch texture uploads
//! - **Better compression**: WebP compresses similar frames better in bulk
//!
//! ## Atlas Layout
//!
//! Each atlas is a 4×8 grid (32 thumbnails):
//! ```text
//! [0][1][2][3][4][5][6][7]
//! [8][9][10][11][12][13][14][15]
//! [16][17][18][19][20][21][22][23]
//! [24][25][26][27][28][29][30][31]
//! ```
//!
//! For 160×90 thumbnails: Atlas is 1280×360 pixels
//! For 80×45 thumbnails: Atlas is 640×180 pixels

use dashmap::DashMap;
use image::{ImageBuffer, Rgba, RgbaImage};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::{DensityLevel, ResolutionTier};

/// Number of thumbnails per atlas (4 rows × 8 columns)
pub const THUMBNAILS_PER_ATLAS: usize = 32;
pub const ATLAS_COLS: u32 = 8;
pub const ATLAS_ROWS: u32 = 4;

/// Atlas metadata - tracks which thumbnails are stored in which atlas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtlasMetadata {
    /// Atlas file path
    pub path: PathBuf,
    /// Atlas index (0, 1, 2, ...)
    pub index: u32,
    /// Timestamps stored in this atlas (up to 32)
    pub timestamps: Vec<f64>,
    /// Number of thumbnails currently in this atlas
    pub count: usize,
}

impl AtlasMetadata {
    pub fn new(path: PathBuf, index: u32) -> Self {
        Self {
            path,
            index,
            timestamps: Vec::with_capacity(THUMBNAILS_PER_ATLAS),
            count: 0,
        }
    }

    /// Check if atlas is full
    pub fn is_full(&self) -> bool {
        self.count >= THUMBNAILS_PER_ATLAS
    }

    /// Get grid position (col, row) for a timestamp
    pub fn get_position(&self, time: f64) -> Option<(u32, u32)> {
        self.timestamps.iter().position(|&t| (t - time).abs() < 0.001).map(|idx| {
            let col = (idx as u32) % ATLAS_COLS;
            let row = (idx as u32) / ATLAS_COLS;
            (col, row)
        })
    }

    /// Add a timestamp to this atlas
    pub fn add_timestamp(&mut self, time: f64) -> usize {
        let idx = self.count;
        self.timestamps.push(time);
        self.count += 1;
        idx
    }
}

/// Atlas cache entry - maps timestamps to atlas locations
#[derive(Debug, Clone)]
pub struct AtlasLocation {
    /// Atlas file path
    pub atlas_path: PathBuf,
    /// Atlas index
    pub atlas_index: u32,
    /// Column in atlas (0-7)
    pub col: u32,
    /// Row in atlas (0-3)
    pub row: u32,
}

/// Atlas manager for a single video at one density level
pub struct AtlasManager {
    /// Video ID (hash of path)
    video_id: String,
    /// Density level
    density: DensityLevel,
    /// Resolution tier
    resolution_tier: ResolutionTier,
    /// Cache directory
    cache_dir: PathBuf,
    /// List of atlases (ordered by index)
    atlases: Vec<AtlasMetadata>,
    /// Map: timestamp_ms -> atlas location
    timestamp_map: DashMap<u64, AtlasLocation>,
    /// Current atlas being filled
    current_atlas_index: u32,
}

impl AtlasManager {
    pub fn new(
        video_id: String,
        density: DensityLevel,
        resolution_tier: ResolutionTier,
        cache_dir: PathBuf,
    ) -> Self {
        Self {
            video_id,
            density,
            resolution_tier,
            cache_dir,
            atlases: Vec::new(),
            timestamp_map: DashMap::new(),
            current_atlas_index: 0,
        }
    }

    /// Get atlas location for a timestamp
    pub fn get_location(&self, time: f64) -> Option<AtlasLocation> {
        let timestamp_ms = (time * 1000.0).round() as u64;
        self.timestamp_map.get(&timestamp_ms).map(|entry| entry.clone())
    }

    /// Allocate space for a new thumbnail
    pub fn allocate(&mut self, time: f64) -> AtlasLocation {
        let timestamp_ms = (time * 1000.0).round() as u64;

        // Check if already allocated
        if let Some(location) = self.timestamp_map.get(&timestamp_ms) {
            return location.clone();
        }

        // Get or create current atlas
        if self.atlases.is_empty() || self.atlases.last().unwrap().is_full() {
            let atlas_path = self.atlas_path(self.current_atlas_index);
            let atlas = AtlasMetadata::new(atlas_path, self.current_atlas_index);
            self.atlases.push(atlas);
            self.current_atlas_index += 1;
        }

        let atlas = self.atlases.last_mut().unwrap();
        let idx = atlas.add_timestamp(time);
        let col = (idx as u32) % ATLAS_COLS;
        let row = (idx as u32) / ATLAS_COLS;

        let location = AtlasLocation {
            atlas_path: atlas.path.clone(),
            atlas_index: atlas.index,
            col,
            row,
        };

        self.timestamp_map.insert(timestamp_ms, location.clone());
        location
    }

    /// Generate atlas file path
    fn atlas_path(&self, index: u32) -> PathBuf {
        let filename = format!(
            "{}_{}_{:04}_{}.webp",
            self.video_id,
            self.density.label(),
            index,
            self.resolution_tier.label()
        );
        self.cache_dir.join(filename)
    }
}

/// Atlas builder - creates atlas images from individual thumbnails
pub struct AtlasBuilder {
    /// Thumbnail width
    thumb_width: u32,
    /// Thumbnail height
    thumb_height: u32,
    /// Atlas image buffer
    atlas: RgbaImage,
    /// Number of thumbnails added
    count: usize,
}

impl AtlasBuilder {
    pub fn new(thumb_width: u32, thumb_height: u32) -> Self {
        let atlas_width = thumb_width * ATLAS_COLS;
        let atlas_height = thumb_height * ATLAS_ROWS;
        let atlas = ImageBuffer::from_pixel(atlas_width, atlas_height, Rgba([0, 0, 0, 0]));

        Self {
            thumb_width,
            thumb_height,
            atlas,
            count: 0,
        }
    }

    /// Add a thumbnail to the atlas at the next available position
    pub fn add_thumbnail(&mut self, rgba_data: &[u8]) -> Result<(u32, u32), String> {
        if self.count >= THUMBNAILS_PER_ATLAS {
            return Err("Atlas is full".to_string());
        }

        let col = (self.count as u32) % ATLAS_COLS;
        let row = (self.count as u32) / ATLAS_COLS;
        let x_offset = col * self.thumb_width;
        let y_offset = row * self.thumb_height;

        // Copy thumbnail data into atlas
        for y in 0..self.thumb_height {
            for x in 0..self.thumb_width {
                let src_idx = ((y * self.thumb_width + x) * 4) as usize;
                if src_idx + 3 < rgba_data.len() {
                    let pixel = Rgba([
                        rgba_data[src_idx],
                        rgba_data[src_idx + 1],
                        rgba_data[src_idx + 2],
                        rgba_data[src_idx + 3],
                    ]);
                    self.atlas.put_pixel(x_offset + x, y_offset + y, pixel);
                }
            }
        }

        self.count += 1;
        Ok((col, row))
    }

    /// Save the atlas to disk as WebP
    pub async fn save(&self, path: &PathBuf) -> Result<(), String> {
        use image::codecs::webp::WebPEncoder;

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await
                .map_err(|e| format!("Failed to create atlas directory: {}", e))?;
        }

        // Encode to WebP
        let mut webp_data = Vec::new();
        let encoder = WebPEncoder::new_lossless(&mut webp_data);
        encoder.encode(
            self.atlas.as_raw(),
            self.atlas.width(),
            self.atlas.height(),
            image::ExtendedColorType::Rgba8,
        ).map_err(|e| format!("WebP encoding failed: {}", e))?;

        // Write to file
        tokio::fs::write(path, &webp_data).await
            .map_err(|e| format!("Failed to write atlas file: {}", e))?;

        eprintln!("[AtlasBuilder] Saved atlas: {} ({} thumbnails, {} bytes)",
                  path.display(), self.count, webp_data.len());

        Ok(())
    }

    /// Get the number of thumbnails in this atlas
    pub fn count(&self) -> usize {
        self.count
    }
}

/// Global atlas cache - one manager per (video, density, resolution)
pub static ATLAS_CACHE: Lazy<DashMap<String, Arc<RwLock<AtlasManager>>>> =
    Lazy::new(DashMap::new);

/// Get or create atlas manager for a video
pub async fn get_atlas_manager(
    video_id: &str,
    density: DensityLevel,
    resolution_tier: ResolutionTier,
    cache_dir: PathBuf,
) -> Arc<RwLock<AtlasManager>> {
    let key = format!("{}:{}:{}", video_id, density.label(), resolution_tier.label());

    if let Some(manager) = ATLAS_CACHE.get(&key) {
        return manager.clone();
    }

    let manager = Arc::new(RwLock::new(AtlasManager::new(
        video_id.to_string(),
        density,
        resolution_tier,
        cache_dir,
    )));

    ATLAS_CACHE.insert(key, manager.clone());
    manager
}
