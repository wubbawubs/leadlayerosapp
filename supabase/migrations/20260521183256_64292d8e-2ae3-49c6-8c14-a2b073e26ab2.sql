-- Add wordpress_com to connection_type enum for WordPress.com OAuth connector
ALTER TYPE connection_type ADD VALUE IF NOT EXISTS 'wordpress_com';