-- Organization industry classification for the four supported business domains.
ALTER TABLE organizations ADD COLUMN industry TEXT
  CHECK(industry IS NULL OR industry IN ('BFSI','ECOMMERCE','LOGISTICS','HOTELS'));

-- Existing workspaces remain unclassified until their owner explicitly selects a domain.
