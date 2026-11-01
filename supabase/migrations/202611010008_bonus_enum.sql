-- The ledger gains the two entry types a desk bonus settles into.
--
-- `ALTER TYPE ADD VALUE` cannot run in a transaction that also uses the new
-- value, so the enum extension stands alone in its own migration.
begin;

alter type public.ledger_entry_type add value if not exists 'bonus_earning_held';
alter type public.ledger_entry_type add value if not exists 'bonus_earning_available';

commit;
