CREATE TABLE IF NOT EXISTS dimension_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_name VARCHAR(120) NOT NULL,
  period_month CHAR(7) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NULL,
  file_size INT UNSIGNED NOT NULL,
  file_content LONGBLOB NOT NULL,
  total_rows INT UNSIGNED NOT NULL,
  warnings JSON NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_import_campaign_period (campaign_name, period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dimension_intervals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_id BIGINT UNSIGNED NOT NULL,
  campaign_name VARCHAR(120) NOT NULL,
  service_date DATE NOT NULL,
  time_slot TIME NOT NULL,
  planned_calls DECIMAL(14,6) NULL,
  planned_tmg_seconds DECIMAL(14,6) NULL,
  required_advisors DECIMAL(14,6) NULL,
  planned_hours DECIMAL(14,6) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_dimension_import FOREIGN KEY (import_id) REFERENCES dimension_imports(id) ON DELETE CASCADE,
  UNIQUE KEY uq_campaign_date_slot (campaign_name, service_date, time_slot),
  INDEX idx_campaign_date (campaign_name, service_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
