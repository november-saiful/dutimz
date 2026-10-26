-- Every wallet starts again at zero.
--
-- The money feature is going to be rebuilt, so the balances it accumulated are cleared: the ledger
-- is emptied and the withdrawal requests still waiting are removed. Both are deliberate and
-- irreversible — the ledger is the only record of what anyone earned, and there is no copy of it.
--
-- `earnings_ledger` is append-only by trigger, so the trigger is dropped for the length of this
-- transaction and put back exactly as it was. Future ledger writes stay immutable.
begin;

drop trigger if exists earnings_ledger_append_only on public.earnings_ledger;
delete from public.earnings_ledger;

-- A pending request counts as reserved money even before it has a ledger row, so it has to go too.
-- Settled requests stay as history: they no longer contribute to any balance, and the ledger rows
-- they once pointed at are gone with the rest.
delete from public.withdrawals where status = 'pending';

create trigger earnings_ledger_append_only
  before update or delete on public.earnings_ledger
  for each row execute function public.prevent_ledger_mutation();

commit;
