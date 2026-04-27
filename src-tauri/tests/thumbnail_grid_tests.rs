//! Integration tests for timestamp grid generation and video cache fallback
//!
//! These tests validate grid alignment and cache fallback behavior.

use tauri_app_lib::thumbnail_engine::{
    generate_timestamp_grid, VideoCache, DensityLevel, CachedFrame
};
use std::path::PathBuf;

// =========================================================================
// TIMESTAMP GRID GENERATION TESTS
// =========================================================================

#[test]
fn test_generate_timestamp_grid() {
    let timestamps = generate_timestamp_grid(0.0, 10.0, 1.0);
    
    // Should include buffer of one thumbnail on each side
    assert!(timestamps.len() >= 10, "Should have at least 10 timestamps");
    
    // First timestamp should be before visible_start (buffer)
    assert!(timestamps[0] < 0.0 || timestamps[0] == 0.0);
    
    // Last timestamp should be after visible_end (buffer)
    assert!(timestamps[timestamps.len() - 1] >= 10.0);
    
    // Timestamps should be evenly spaced
    for i in 1..timestamps.len() {
        let diff = timestamps[i] - timestamps[i - 1];
        assert!((diff - 1.0).abs() < 0.001, "Timestamps should be 1.0s apart");
    }
}

#[test]
fn test_generate_timestamp_grid_with_fractional_interval() {
    let timestamps = generate_timestamp_grid(0.0, 5.0, 0.5);
    
    // Should have ~10 timestamps (5.0 / 0.5 = 10, plus buffers)
    assert!(timestamps.len() >= 10);
    
    // Timestamps should be 0.5s apart
    for i in 1..timestamps.len() {
        let diff = timestamps[i] - timestamps[i - 1];
        assert!((diff - 0.5).abs() < 0.001, "Timestamps should be 0.5s apart");
    }
}

// =========================================================================
// VIDEO CACHE FALLBACK TESTS
// =========================================================================

#[tokio::test]
async fn test_video_cache_fallback_to_lower_density() {
    let cache = VideoCache::new(
        "test_video".to_string(),
        "/test/video.mp4".to_string(),
        10.0,
    );

    // Insert frame at High density
    if let Some(high_cache) = cache.levels.get(&DensityLevel::High) {
        high_cache.insert(5.0, CachedFrame::new(5.0, PathBuf::from("/cache/high_5.webp")));
    }

    // Request at Ultra density (not cached)
    // Should fallback to High density
    let result = cache.get_frame_path(5.0, DensityLevel::Ultra);
    
    assert!(result.is_some(), "Should fallback to lower density");
    let (path, density) = result.unwrap();
    assert_eq!(density, DensityLevel::High, "Should return High density frame");
    assert_eq!(path, PathBuf::from("/cache/high_5.webp"));
}
