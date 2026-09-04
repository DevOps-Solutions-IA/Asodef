-- Dedicated persistence for payment orders sourced from Firebird Master.
-- Kept outside Prisma's public schema so legacy identities are not fabricated
-- as modern Customer/Obligation rows. Every financial transition is durable.
CREATE SCHEMA IF NOT EXISTS legacy_bridge;

CREATE TABLE legacy_bridge.master_payment_orders (
  id uuid PRIMARY KEY,
  public_reference text NOT NULL UNIQUE,
  subject_ref text NOT NULL,
  full_name text NOT NULL,
  document_type text NOT NULL,
  masked_document text NOT NULL,
  contract_id text NOT NULL,
  installment_id text NOT NULL,
  concept text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency varchar(3) NOT NULL CHECK (currency = 'COP'),
  due_date timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','PROCESSING','APPROVED','REJECTED','FAILED','EXPIRED','CANCELLED')),
  legacy_quote_id varchar(36) NOT NULL UNIQUE,
  legacy_state text NOT NULL,
  provider_link_id text UNIQUE,
  provider_checkout_url text,
  provider_status text,
  provider_transaction_id text,
  provider_raw jsonb,
  reconciliation_result text,
  master_receipt text,
  master_document text,
  failure_code text,
  terms_version_id uuid NOT NULL,
  acceptance_ip text,
  acceptance_user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX master_payment_orders_contract_installment_idx
  ON legacy_bridge.master_payment_orders (contract_id, installment_id, created_at DESC);
CREATE INDEX master_payment_orders_status_idx
  ON legacy_bridge.master_payment_orders (status, updated_at DESC);

CREATE TABLE legacy_bridge.master_payment_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES legacy_bridge.master_payment_orders(id) ON DELETE RESTRICT,
  source text NOT NULL,
  event_type text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX master_payment_events_order_idx
  ON legacy_bridge.master_payment_events (order_id, received_at DESC);

REVOKE ALL ON SCHEMA legacy_bridge FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA legacy_bridge FROM PUBLIC;
