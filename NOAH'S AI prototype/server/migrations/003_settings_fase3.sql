ALTER TABLE settings ADD COLUMN role_pools TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN layout_mode TEXT DEFAULT 'home';
ALTER TABLE settings ADD COLUMN cube_visible INTEGER DEFAULT 1;
ALTER TABLE settings ADD COLUMN active_agents TEXT DEFAULT '[]';
