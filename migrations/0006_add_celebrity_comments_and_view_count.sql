-- Migration: Remove celebrity profiles table and add celebrity comments table with view count table
-- Created: 2024-01-XX

-- Drop celebrity_profiles table if exists (move to static frontend management)
DROP TABLE IF EXISTS celebrity_profiles;

-- Create celebrity_view_counts table for tracking view counts only
CREATE TABLE celebrity_view_counts (
    celebrity_id TEXT PRIMARY KEY,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create celebrity_comments table
CREATE TABLE celebrity_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    celebrity_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES celebrity_comments(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_celebrity_comments_celebrity_id ON celebrity_comments(celebrity_id);
CREATE INDEX idx_celebrity_comments_user_id ON celebrity_comments(user_id);
CREATE INDEX idx_celebrity_comments_parent_id ON celebrity_comments(parent_id);
CREATE INDEX idx_celebrity_comments_created_at ON celebrity_comments(created_at);
CREATE INDEX idx_celebrity_view_counts_celebrity_id ON celebrity_view_counts(celebrity_id); 