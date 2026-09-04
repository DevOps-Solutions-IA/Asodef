-- Correct the draft Master-payment persistence boundary before it is used by
-- checkout. The original names implied a certified Firebird quote procedure;
-- no such write contract is approved. These fields are ASODEF-side state only.
ALTER TABLE legacy_bridge.master_payment_orders
  RENAME COLUMN legacy_quote_id TO application_key;

ALTER TABLE legacy_bridge.master_payment_orders
  RENAME COLUMN legacy_state TO legacy_application_state;

-- Database defense in depth: there may be historical terminal attempts, but
-- never two simultaneously payable/processing ASODEF orders for one Master
-- contract installment.
CREATE UNIQUE INDEX master_payment_orders_one_active_installment_idx
  ON legacy_bridge.master_payment_orders (contract_id, installment_id)
  WHERE status IN ('PENDING', 'PROCESSING');

-- Reserved for provider reconciliation once a certified transaction identifier
-- is available. Null remains allowed because the currently approved provider
-- abstraction exposes status/raw data, not a confirmed transaction-id field.
CREATE UNIQUE INDEX master_payment_orders_provider_transaction_unique_idx
  ON legacy_bridge.master_payment_orders (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
