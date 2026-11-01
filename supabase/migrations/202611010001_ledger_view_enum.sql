-- The ledger gains the two entry types view income settles into.
--
-- `ALTER TYPE ADD VALUE` cannot run in a transaction that also uses the new
-- value, so the enum extension stands alone in its own migration.
begin;

alter type public.ledger_entry_type add value if not exists 'view_earning_available';
alter type public.ledger_entry_type add value if not exists 'view_earning_held';

commit;
