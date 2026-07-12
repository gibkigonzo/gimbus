-- Data-only migration (not schema DDL). `sealed` (added in 0002) had no
-- writer until saveTurn() started setting it explicitly — every row inserted
-- before that point represents a turn that ran to normal completion (there
-- was no partial-save path yet), so backfill them all to sealed=1 rather
-- than leaving them looking like cut-short/partial turns by default.
UPDATE `messages` SET `sealed` = 1 WHERE `role` IN ('assistant', 'tool');
