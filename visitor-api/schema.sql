CREATE TABLE IF NOT EXISTS totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  started_at TEXT
);
INSERT OR IGNORE INTO totals (id, views) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS locations (
  country TEXT NOT NULL CHECK (length(country) = 2),
  latitude INTEGER NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude INTEGER NOT NULL CHECK (longitude >= -180 AND longitude < 180),
  views INTEGER NOT NULL CHECK (views > 0),
  PRIMARY KEY (country, latitude, longitude)
);

-- Private records: never selected by the public /visits endpoint.
CREATE TABLE IF NOT EXISTS ip_visits (
  visit_day TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT,
  latitude INTEGER,
  longitude INTEGER,
  views INTEGER NOT NULL CHECK (views > 0),
  PRIMARY KEY (visit_day, ip)
);
