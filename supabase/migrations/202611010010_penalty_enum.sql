-- The ledger gains the entry type a desk penalty settles into.
--
-- `ALTER TYPE ADD VALUE` cannot run in a transaction that also uses the new
-- value, so the enum extension stands alone in its own migration.
begin;

alter type public.ledger_entry_type add value if not exists 'penalty';

commit;
