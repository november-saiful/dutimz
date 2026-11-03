-- The ledger gains the entry type a deleted story's money is taken back through.
--
-- `ALTER TYPE ADD VALUE` cannot run in a transaction that also uses the new
-- value, so the enum extension stands alone in its own migration.
begin;

alter type public.ledger_entry_type add value if not exists 'article_deletion_clawback';

commit;
