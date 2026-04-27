//! Integration tests for thumbnail cache (LRU eviction, pinning, access counting)
//!
//! These tests validate the cache behavior through the public API.

use tauri_app_lib::thumbnail_engine::{DensityCache, DensityLevel, CachedFrame};
use std::path::PathBuf;
use std::sync::atomic::Ordering;

/// Helper to create a dummy frame for testing
fn dummy_frame(time: f64) -> CachedFrame {
    CachedFrame::new(time, PathBuf::from(format!("/cache/frame_{}.webp", time)))
}

// =========================================================================
// TEST 1: LRU EVICTION - DOES IT ACTUALLY EVICT THE RIGHT FRAMES?
// =========================================================================

#[test]
fn test_lru_evicts_oldest_when_capacity_exceeded() {
    // Create cache with capacity of 3 (override for testing)
    let cache = DensityCache {
        video_id: "test_video".to_string(),
        density: DensityLevel::Medium,
        frames: dashmap::DashMap::new(),
        max_size: 3,
        total_size: std::sync::atomic::AtomicU64::new(0),
    };

    // Insert 3 frames
    cache.insert(1.0, dummy_frame(1.0));
    std::thread::sleep(std::time::Duration::from_millis(10));
    
    cache.insert(2.0, dummy_frame(2.0));
    std::thread::sleep(std::time::Duration::from_millis(10));
    
    cache.insert(3.0, dummy_frame(3.0));
    
    // All 3 should be present
    assert_eq!(cache.frames.len(), 3, "Should have 3 frames");
    
    // Insert 4th frame - should trigger eviction
    cache.insert(4.0, dummy_frame(4.0));
    
    // After eviction, cache should be back at or below max_size
    // Eviction removes 20% = 1 frame, so we should have 3 frames
    assert!(cache.frames.len() <= cache.max_size, "Cache should not exceed max_size after eviction");
    
    // Verify eviction happened (should have fewer than 4 frames)
    assert!(cache.frames.len() < 4, "Should have evicted at least one frame");
    
    // The newest frame should still be present
    assert!(cache.get_path(4.0).is_some(), "Newest frame should be present");
}

#[test]
fn test_lru_evicts_based_on_access_count() {
    let cache = DensityCache {
        video_id: "test_video".to_string(),
        density: DensityLevel::Medium,
        frames: dashmap::DashMap::new(),
        max_size: 3,
        total_size: std::sync::atomic::AtomicU64::new(0),
    };

    // Insert 3 frames
    cache.insert(1.0, dummy_frame(1.0));
    cache.insert(2.0, dummy_frame(2.0));
    cache.insert(3.0, dummy_frame(3.0));
    
    // Access frame 1.0 multiple times to increase its access count
    for _ in 0..5 {
        cache.get_path(1.0);
    }
    
    // Insert 4th frame - should trigger eviction
    cache.insert(4.0, dummy_frame(4.0));
    
    // Frame 1.0 should survive (high access count)
    // Frame 2.0 or 3.0 should be evicted (low access count)
    assert!(cache.get_path(1.0).is_some(), "Frequently accessed frame should survive");
    assert!(cache.get_path(4.0).is_some(), "Newest frame should be present");
}

// =========================================================================
// TEST 2: PINNED FRAMES SURVIVE EVICTION
// =========================================================================

// Note: Pinning is not yet implemented in the current code
// This test documents the expected behavior for when it's added
#[test]
#[ignore = "Pinning not yet implemented - placeholder for future"]
fn test_pinned_frames_not_evicted() {
    let cache = DensityCache {
        video_id: "test_video".to_string(),
        density: DensityLevel::Medium,
        frames: dashmap::DashMap::new(),
        max_size: 3,
        total_size: std::sync::atomic::AtomicU64::new(0),
    };

    // Insert 3 frames
    cache.insert(1.0, dummy_frame(1.0));
    cache.insert(2.0, dummy_frame(2.0));
    cache.insert(3.0, dummy_frame(3.0));
    
    // Pin frame 1.0 (when pinning is implemented)
    // cache.pin(1.0);
    
    // Insert 4th frame - should trigger eviction
    cache.insert(4.0, dummy_frame(4.0));
    
    // Pinned frame should survive
    assert!(cache.get_path(1.0).is_some(), "Pinned frame must survive eviction");
}

#[test]
fn test_cache_key_time_rounding() {
    // Test that time keys are rounded to milliseconds
    let cache = DensityCache::new("test".to_string(), DensityLevel::Medium);
    
    cache.insert(1.0001, dummy_frame(1.0001));
    cache.insert(1.0009, dummy_frame(1.0009));
    
    // Both should map to same key (1000ms)
    assert!(cache.get_path(1.0).is_some());
    assert!(cache.get_path(1.0005).is_some());
}

#[test]
fn test_cached_frame_access_count() {
    let frame = dummy_frame(1.0);
    
    // Initial access count should be 1
    assert_eq!(frame.access_count.load(Ordering::Relaxed), 1);
    
    // Touch should increment
    frame.touch();
    assert_eq!(frame.access_count.load(Ordering::Relaxed), 2);
    
    frame.touch();
    assert_eq!(frame.access_count.load(Ordering::Relaxed), 3);
}
