\set ON_ERROR_STOP on
\timing off

DROP SCHEMA IF EXISTS bingo_card_bench CASCADE;
CREATE SCHEMA bingo_card_bench;
SET search_path = bingo_card_bench, public;
SET jit = off;

CREATE TABLE benchmark_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  postgres_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  settings jsonb NOT NULL
);

INSERT INTO benchmark_run (postgres_version, settings)
SELECT version(), jsonb_build_object(
  'shared_buffers', current_setting('shared_buffers'),
  'work_mem', current_setting('work_mem'),
  'effective_cache_size', current_setting('effective_cache_size'),
  'max_connections', current_setting('max_connections'),
  'jit', current_setting('jit')
);

CREATE TABLE metric_sample (
  dataset_size integer NOT NULL,
  representation text NOT NULL,
  operation text NOT NULL,
  sample_no integer NOT NULL,
  elapsed_ms double precision NOT NULL CHECK (elapsed_ms >= 0),
  rows_seen bigint,
  PRIMARY KEY (dataset_size, representation, operation, sample_no)
);

CREATE TABLE storage_sample (
  dataset_size integer NOT NULL,
  representation text NOT NULL,
  table_bytes bigint NOT NULL,
  index_bytes bigint NOT NULL,
  total_bytes bigint NOT NULL,
  PRIMARY KEY (dataset_size, representation)
);

CREATE TABLE plan_sample (
  dataset_size integer NOT NULL,
  representation text NOT NULL,
  operation text NOT NULL,
  plan jsonb NOT NULL,
  PRIMARY KEY (dataset_size, representation, operation)
);

CREATE OR REPLACE FUNCTION card_numbers(card_no integer)
RETURNS smallint[]
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
  result smallint[] := ARRAY[]::smallint[];
  coprimes integer[] := ARRAY[1, 2, 4, 7, 8, 11, 13, 14];
  position integer;
  column_no integer;
  row_no integer;
  multiplier integer;
  offset_no integer;
BEGIN
  FOR position IN 0..24 LOOP
    IF position = 12 THEN
      result := array_append(result, 0::smallint);
    ELSE
      column_no := position % 5;
      row_no := position / 5;
      multiplier := coprimes[
        mod(
          hashtextextended(card_no::text || ':' || column_no::text || ':m', 0)
            & 9223372036854775807,
          8
        )::integer + 1
      ];
      offset_no := mod(
        hashtextextended(card_no::text || ':' || column_no::text || ':o', 0)
          & 9223372036854775807,
        15
      )::integer;
      result := array_append(
        result,
        (column_no * 15 + 1 + mod(offset_no + multiplier * row_no, 15))::smallint
      );
    END IF;
  END LOOP;
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION numbers_mask(numbers smallint[], positions integer[] DEFAULT NULL)
RETURNS bit(75)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  result bit(75) := B'0'::bit(75);
  position integer;
  ball integer;
BEGIN
  FOREACH position IN ARRAY coalesce(positions, ARRAY(SELECT generate_series(1, 25))) LOOP
    ball := numbers[position];
    IF ball > 0 THEN
      result := set_bit(result, ball - 1, 1);
    END IF;
  END LOOP;
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION pack_numbers(numbers smallint[])
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT decode(string_agg(lpad(to_hex(value::integer), 2, '0'), '' ORDER BY ordinal), 'hex')
  FROM unnest(numbers) WITH ORDINALITY AS n(value, ordinal)
$$;

CREATE OR REPLACE FUNCTION drawn_mask(max_ball integer)
RETURNS bit(75)
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT string_agg(CASE WHEN n <= max_ball THEN '1' ELSE '0' END, '' ORDER BY n)::bit(75)
  FROM generate_series(1, 75) AS n
$$;

CREATE OR REPLACE FUNCTION balls_mask(balls smallint[])
RETURNS bit(75)
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT string_agg(CASE WHEN n = ANY(balls) THEN '1' ELSE '0' END, '' ORDER BY n)::bit(75)
  FROM generate_series(1, 75) AS n
$$;

CREATE OR REPLACE FUNCTION mask_complete(required bit(75), drawn bit(75))
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$ SELECT (required & drawn) = required $$;

CREATE OR REPLACE FUNCTION array_line(numbers smallint[], drawn smallint[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT array_remove(numbers[1:5], 0::smallint) <@ drawn
      OR array_remove(numbers[6:10], 0::smallint) <@ drawn
      OR array_remove(numbers[11:15], 0::smallint) <@ drawn
      OR array_remove(numbers[16:20], 0::smallint) <@ drawn
      OR array_remove(numbers[21:25], 0::smallint) <@ drawn
$$;

CREATE OR REPLACE FUNCTION array_two_lines(numbers smallint[], drawn smallint[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT (
    (array_remove(numbers[1:5], 0::smallint) <@ drawn)::integer
    + (array_remove(numbers[6:10], 0::smallint) <@ drawn)::integer
    + (array_remove(numbers[11:15], 0::smallint) <@ drawn)::integer
    + (array_remove(numbers[16:20], 0::smallint) <@ drawn)::integer
    + (array_remove(numbers[21:25], 0::smallint) <@ drawn)::integer
  ) >= 2
$$;

CREATE OR REPLACE FUNCTION compact_positions_complete(
  packed bytea,
  positions integer[],
  drawn bit(75)
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
DECLARE
  position integer;
  ball integer;
BEGIN
  FOREACH position IN ARRAY positions LOOP
    ball := get_byte(packed, position - 1);
    IF ball > 0 AND get_bit(drawn, ball - 1) = 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION compact_line(packed bytea, drawn bit(75))
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT compact_positions_complete(packed, ARRAY[1,2,3,4,5], drawn)
      OR compact_positions_complete(packed, ARRAY[6,7,8,9,10], drawn)
      OR compact_positions_complete(packed, ARRAY[11,12,13,14,15], drawn)
      OR compact_positions_complete(packed, ARRAY[16,17,18,19,20], drawn)
      OR compact_positions_complete(packed, ARRAY[21,22,23,24,25], drawn)
$$;

CREATE OR REPLACE FUNCTION compact_two_lines(packed bytea, drawn bit(75))
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT (
    compact_positions_complete(packed, ARRAY[1,2,3,4,5], drawn)::integer
    + compact_positions_complete(packed, ARRAY[6,7,8,9,10], drawn)::integer
    + compact_positions_complete(packed, ARRAY[11,12,13,14,15], drawn)::integer
    + compact_positions_complete(packed, ARRAY[16,17,18,19,20], drawn)::integer
    + compact_positions_complete(packed, ARRAY[21,22,23,24,25], drawn)::integer
  ) >= 2
$$;

CREATE UNLOGGED TABLE source_cards (
  card_no integer PRIMARY KEY,
  participant_no integer NOT NULL,
  numbers smallint[] NOT NULL UNIQUE CHECK (cardinality(numbers) = 25)
);

CREATE UNLOGGED TABLE normalized_card (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_no integer NOT NULL UNIQUE,
  participant_no integer NOT NULL
);
CREATE INDEX normalized_card_participant_idx ON normalized_card (participant_no, card_no);

CREATE UNLOGGED TABLE normalized_cell (
  card_id integer NOT NULL REFERENCES normalized_card(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 25),
  ball smallint CHECK (ball BETWEEN 1 AND 75),
  PRIMARY KEY (card_id, position),
  UNIQUE (card_id, ball)
);
CREATE INDEX normalized_cell_ball_idx ON normalized_cell (ball, card_id);

CREATE UNLOGGED TABLE array_card (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_no integer NOT NULL UNIQUE,
  participant_no integer NOT NULL,
  numbers smallint[] NOT NULL CHECK (cardinality(numbers) = 25)
);
CREATE INDEX array_card_participant_idx ON array_card (participant_no, card_no);
CREATE INDEX array_card_numbers_gin_idx ON array_card USING gin (numbers);

CREATE UNLOGGED TABLE bitset_card (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_no integer NOT NULL UNIQUE,
  participant_no integer NOT NULL,
  row_masks bit(75)[] NOT NULL CHECK (cardinality(row_masks) = 5),
  corner_mask bit(75) NOT NULL,
  full_mask bit(75) NOT NULL,
  custom_mask bit(75) NOT NULL
);
CREATE INDEX bitset_card_participant_idx ON bitset_card (participant_no, card_no);

CREATE UNLOGGED TABLE compact_card (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_no integer NOT NULL UNIQUE,
  participant_no integer NOT NULL,
  packed bytea NOT NULL CHECK (octet_length(packed) = 25)
);
CREATE INDEX compact_card_participant_idx ON compact_card (participant_no, card_no);

CREATE OR REPLACE FUNCTION record_query(
  dataset integer,
  representation_name text,
  operation_name text,
  statement text,
  repetitions integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  started timestamptz;
  row_count bigint;
  sample integer;
BEGIN
  -- Warm the relevant relation and expression paths without recording them.
  FOR sample IN 1..2 LOOP
    EXECUTE statement INTO row_count;
  END LOOP;

  FOR sample IN 1..repetitions LOOP
    started := clock_timestamp();
    EXECUTE statement INTO row_count;
    INSERT INTO metric_sample VALUES (
      dataset, representation_name, operation_name, sample,
      extract(epoch FROM clock_timestamp() - started) * 1000,
      row_count
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION record_plan(
  dataset integer,
  representation_name text,
  operation_name text,
  statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  plan_json jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || statement INTO plan_json;
  INSERT INTO plan_sample VALUES (dataset, representation_name, operation_name, plan_json);
END
$$;

CREATE OR REPLACE PROCEDURE run_dataset(dataset integer)
LANGUAGE plpgsql
AS $$
DECLARE
  started timestamptz;
  sample integer;
  generated bigint;
  -- Sixty balls distributed over the complete 1..75 range. This produces both
  -- positive and negative candidates for all patterns, unlike the biased 1..60 set.
  drawn_array smallint[] := ARRAY(
    SELECT n::smallint FROM generate_series(1, 75) AS n WHERE n % 5 <> 0
  );
  drawn_bits bit(75) := balls_mask(ARRAY(
    SELECT n::smallint FROM generate_series(1, 75) AS n WHERE n % 5 <> 0
  ));
  query_repetitions integer := 15;
  insert_repetitions integer := 5;
  source_sql text := format(
    'INSERT INTO source_cards(card_no, participant_no, numbers)
     SELECT n, ((n - 1) / 3) + 1, card_numbers(n)
     FROM generate_series(1, %s) AS n', dataset
  );
BEGIN
  RAISE NOTICE 'Benchmarking % cards', dataset;

  FOR sample IN 1..insert_repetitions LOOP
    TRUNCATE source_cards;
    started := clock_timestamp();
    EXECUTE source_sql;
    GET DIAGNOSTICS generated = ROW_COUNT;
    INSERT INTO metric_sample VALUES (
      dataset, 'common', 'generation', sample,
      extract(epoch FROM clock_timestamp() - started) * 1000, generated
    );
  END LOOP;

  FOR sample IN 1..insert_repetitions LOOP
    TRUNCATE normalized_cell, normalized_card RESTART IDENTITY;
    started := clock_timestamp();
    INSERT INTO normalized_card(card_no, participant_no)
      SELECT card_no, participant_no FROM source_cards ORDER BY card_no;
    INSERT INTO normalized_cell(card_id, position, ball)
      SELECT c.id, u.ordinal::smallint, nullif(u.ball, 0)::smallint
      FROM source_cards s
      JOIN normalized_card c USING (card_no)
      CROSS JOIN LATERAL unnest(s.numbers) WITH ORDINALITY AS u(ball, ordinal);
    INSERT INTO metric_sample VALUES (
      dataset, 'normalized', 'insertion', sample,
      extract(epoch FROM clock_timestamp() - started) * 1000,
      (SELECT count(*) FROM normalized_card)
    );
  END LOOP;

  FOR sample IN 1..insert_repetitions LOOP
    TRUNCATE array_card RESTART IDENTITY;
    started := clock_timestamp();
    INSERT INTO array_card(card_no, participant_no, numbers)
      SELECT card_no, participant_no, numbers FROM source_cards ORDER BY card_no;
    INSERT INTO metric_sample VALUES (
      dataset, 'array_gin', 'insertion', sample,
      extract(epoch FROM clock_timestamp() - started) * 1000,
      (SELECT count(*) FROM array_card)
    );
  END LOOP;

  FOR sample IN 1..insert_repetitions LOOP
    TRUNCATE bitset_card RESTART IDENTITY;
    started := clock_timestamp();
    INSERT INTO bitset_card(
      card_no, participant_no, row_masks, corner_mask, full_mask, custom_mask
    )
    SELECT card_no, participant_no,
      ARRAY[
        numbers_mask(numbers, ARRAY[1,2,3,4,5]),
        numbers_mask(numbers, ARRAY[6,7,8,9,10]),
        numbers_mask(numbers, ARRAY[11,12,13,14,15]),
        numbers_mask(numbers, ARRAY[16,17,18,19,20]),
        numbers_mask(numbers, ARRAY[21,22,23,24,25])
      ],
      numbers_mask(numbers, ARRAY[1,5,21,25]),
      numbers_mask(numbers),
      numbers_mask(numbers, ARRAY[1,7,13,19,25])
    FROM source_cards ORDER BY card_no;
    INSERT INTO metric_sample VALUES (
      dataset, 'bitset_masks', 'insertion', sample,
      extract(epoch FROM clock_timestamp() - started) * 1000,
      (SELECT count(*) FROM bitset_card)
    );
  END LOOP;

  FOR sample IN 1..insert_repetitions LOOP
    TRUNCATE compact_card RESTART IDENTITY;
    started := clock_timestamp();
    INSERT INTO compact_card(card_no, participant_no, packed)
      SELECT card_no, participant_no, pack_numbers(numbers)
      FROM source_cards ORDER BY card_no;
    INSERT INTO metric_sample VALUES (
      dataset, 'compact_bytea', 'insertion', sample,
      extract(epoch FROM clock_timestamp() - started) * 1000,
      (SELECT count(*) FROM compact_card)
    );
  END LOOP;

  ANALYZE normalized_card;
  ANALYZE normalized_cell;
  ANALYZE array_card;
  ANALYZE bitset_card;
  ANALYZE compact_card;

  INSERT INTO storage_sample
  SELECT dataset, representation, table_bytes, index_bytes, table_bytes + index_bytes
  FROM (
    VALUES
      ('normalized',
        pg_table_size('normalized_card') + pg_table_size('normalized_cell'),
        pg_indexes_size('normalized_card') + pg_indexes_size('normalized_cell')),
      ('array_gin', pg_table_size('array_card'), pg_indexes_size('array_card')),
      ('bitset_masks', pg_table_size('bitset_card'), pg_indexes_size('bitset_card')),
      ('compact_bytea', pg_table_size('compact_card'), pg_indexes_size('compact_card'))
  ) AS sizes(representation, table_bytes, index_bytes);

  -- Indexed operational lookups.
  PERFORM record_query(dataset, 'normalized', 'lookup_card',
    format('SELECT count(*) FROM normalized_card WHERE card_no = %s', dataset / 2), query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'lookup_card',
    format('SELECT count(*) FROM array_card WHERE card_no = %s', dataset / 2), query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'lookup_card',
    format('SELECT count(*) FROM bitset_card WHERE card_no = %s', dataset / 2), query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'lookup_card',
    format('SELECT count(*) FROM compact_card WHERE card_no = %s', dataset / 2), query_repetitions);

  PERFORM record_query(dataset, 'normalized', 'lookup_participant',
    format('SELECT count(*) FROM normalized_card WHERE participant_no = %s', dataset / 6), query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'lookup_participant',
    format('SELECT count(*) FROM array_card WHERE participant_no = %s', dataset / 6), query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'lookup_participant',
    format('SELECT count(*) FROM bitset_card WHERE participant_no = %s', dataset / 6), query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'lookup_participant',
    format('SELECT count(*) FROM compact_card WHERE participant_no = %s', dataset / 6), query_repetitions);

  -- A newly drawn ball: candidate-card lookup. GIN is intentionally exercised.
  PERFORM record_query(dataset, 'normalized', 'new_ball_61',
    'SELECT count(DISTINCT card_id) FROM normalized_cell WHERE ball = 61', query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'new_ball_61',
    'SELECT count(*) FROM array_card WHERE numbers @> ARRAY[61]::smallint[]', query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'new_ball_61',
    'SELECT count(*) FROM bitset_card WHERE get_bit(full_mask, 60) = 1', query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'new_ball_61',
    'SELECT count(*) FROM compact_card WHERE position(decode(''3d'', ''hex'') IN packed) > 0', query_repetitions);

  -- Normalized representation: positions retain strong relational constraints.
  PERFORM record_query(dataset, 'normalized', 'pattern_line', format($q$
    SELECT count(*) FROM (
      SELECT card_id
      FROM (
        SELECT card_id, ((position - 1) / 5) AS row_no,
          bool_and(ball IS NULL OR ball = ANY(%L::smallint[])) AS complete
        FROM normalized_cell GROUP BY card_id, ((position - 1) / 5)
      ) rows GROUP BY card_id HAVING bool_or(complete)
    ) winners$q$, drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'normalized', 'pattern_two_lines', format($q$
    SELECT count(*) FROM (
      SELECT card_id
      FROM (
        SELECT card_id, ((position - 1) / 5) AS row_no,
          bool_and(ball IS NULL OR ball = ANY(%L::smallint[])) AS complete
        FROM normalized_cell GROUP BY card_id, ((position - 1) / 5)
      ) rows GROUP BY card_id HAVING count(*) FILTER (WHERE complete) >= 2
    ) winners$q$, drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'normalized', 'pattern_corners', format($q$
    SELECT count(*) FROM (
      SELECT card_id FROM normalized_cell WHERE position IN (1,5,21,25)
      GROUP BY card_id HAVING bool_and(ball = ANY(%L::smallint[]))
    ) winners$q$, drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'normalized', 'pattern_full', format($q$
    SELECT count(*) FROM (
      SELECT card_id FROM normalized_cell GROUP BY card_id
      HAVING bool_and(ball IS NULL OR ball = ANY(%L::smallint[]))
    ) winners$q$, drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'normalized', 'pattern_custom', format($q$
    SELECT count(*) FROM (
      SELECT card_id FROM normalized_cell WHERE position IN (1,7,13,19,25)
      GROUP BY card_id HAVING bool_and(ball IS NULL OR ball = ANY(%L::smallint[]))
    ) winners$q$, drawn_array), query_repetitions);

  PERFORM record_query(dataset, 'array_gin', 'pattern_line',
    format('SELECT count(*) FROM array_card WHERE array_line(numbers, %L::smallint[])', drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'pattern_two_lines',
    format('SELECT count(*) FROM array_card WHERE array_two_lines(numbers, %L::smallint[])', drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'pattern_corners',
    format('SELECT count(*) FROM array_card WHERE ARRAY[numbers[1],numbers[5],numbers[21],numbers[25]]::smallint[] <@ %L::smallint[]', drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'pattern_full',
    format('SELECT count(*) FROM array_card WHERE array_remove(numbers, 0::smallint) <@ %L::smallint[]', drawn_array), query_repetitions);
  PERFORM record_query(dataset, 'array_gin', 'pattern_custom',
    format('SELECT count(*) FROM array_card WHERE array_remove(ARRAY[numbers[1],numbers[7],numbers[13],numbers[19],numbers[25]], 0::smallint) <@ %L::smallint[]', drawn_array), query_repetitions);

  PERFORM record_query(dataset, 'bitset_masks', 'pattern_line', format($q$
    SELECT count(*) FROM bitset_card WHERE
      mask_complete(row_masks[1], %L::bit(75)) OR mask_complete(row_masks[2], %L::bit(75)) OR
      mask_complete(row_masks[3], %L::bit(75)) OR mask_complete(row_masks[4], %L::bit(75)) OR
      mask_complete(row_masks[5], %L::bit(75))$q$,
      drawn_bits, drawn_bits, drawn_bits, drawn_bits, drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'pattern_two_lines', format($q$
    SELECT count(*) FROM bitset_card WHERE
      (mask_complete(row_masks[1], %L::bit(75))::integer + mask_complete(row_masks[2], %L::bit(75))::integer +
       mask_complete(row_masks[3], %L::bit(75))::integer + mask_complete(row_masks[4], %L::bit(75))::integer +
       mask_complete(row_masks[5], %L::bit(75))::integer) >= 2$q$,
      drawn_bits, drawn_bits, drawn_bits, drawn_bits, drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'pattern_corners',
    format('SELECT count(*) FROM bitset_card WHERE mask_complete(corner_mask, %L::bit(75))', drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'pattern_full',
    format('SELECT count(*) FROM bitset_card WHERE mask_complete(full_mask, %L::bit(75))', drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'bitset_masks', 'pattern_custom',
    format('SELECT count(*) FROM bitset_card WHERE mask_complete(custom_mask, %L::bit(75))', drawn_bits), query_repetitions);

  PERFORM record_query(dataset, 'compact_bytea', 'pattern_line',
    format('SELECT count(*) FROM compact_card WHERE compact_line(packed, %L::bit(75))', drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'pattern_two_lines',
    format('SELECT count(*) FROM compact_card WHERE compact_two_lines(packed, %L::bit(75))', drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'pattern_corners',
    format('SELECT count(*) FROM compact_card WHERE compact_positions_complete(packed, ARRAY[1,5,21,25], %L::bit(75))', drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'pattern_full',
    format('SELECT count(*) FROM compact_card WHERE compact_positions_complete(packed, ARRAY(SELECT generate_series(1,25)), %L::bit(75))', drawn_bits), query_repetitions);
  PERFORM record_query(dataset, 'compact_bytea', 'pattern_custom',
    format('SELECT count(*) FROM compact_card WHERE compact_positions_complete(packed, ARRAY[1,7,13,19,25], %L::bit(75))', drawn_bits), query_repetitions);

  -- A full-card scan is the full pattern check for each representation.
  INSERT INTO metric_sample
  SELECT dataset_size, representation, 'full_card_scan', sample_no, elapsed_ms, rows_seen
  FROM metric_sample
  WHERE dataset_size = dataset AND operation = 'pattern_full';

  PERFORM record_plan(dataset, 'normalized', 'pattern_full', format($q$
    SELECT count(*) FROM (
      SELECT card_id FROM normalized_cell GROUP BY card_id
      HAVING bool_and(ball IS NULL OR ball = ANY(%L::smallint[]))
    ) winners$q$, drawn_array));
  PERFORM record_plan(dataset, 'array_gin', 'new_ball_61',
    'SELECT count(*) FROM array_card WHERE numbers @> ARRAY[61]::smallint[]');
  PERFORM record_plan(dataset, 'bitset_masks', 'pattern_full',
    format('SELECT count(*) FROM bitset_card WHERE mask_complete(full_mask, %L::bit(75))', drawn_bits));
  PERFORM record_plan(dataset, 'compact_bytea', 'pattern_full',
    format('SELECT count(*) FROM compact_card WHERE compact_positions_complete(packed, ARRAY(SELECT generate_series(1,25)), %L::bit(75))', drawn_bits));
END
$$;

CALL run_dataset(5000);
CALL run_dataset(10000);
CALL run_dataset(25000);
CALL run_dataset(50000);

CREATE VIEW metric_summary AS
SELECT dataset_size, representation, operation,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY elapsed_ms)::numeric, 3) AS p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY elapsed_ms)::numeric, 3) AS p95_ms,
  min(rows_seen) AS result_rows,
  count(*) AS samples
FROM metric_sample
GROUP BY dataset_size, representation, operation;

\copy (SELECT * FROM metric_summary ORDER BY dataset_size, representation, operation) TO 'bingo-card-benchmark-metrics.csv' CSV HEADER
\copy (SELECT dataset_size, representation, table_bytes, index_bytes, total_bytes FROM storage_sample ORDER BY dataset_size, representation) TO 'bingo-card-benchmark-storage.csv' CSV HEADER
\copy (SELECT dataset_size, representation, operation, plan FROM plan_sample ORDER BY dataset_size, representation, operation) TO 'bingo-card-benchmark-plans.csv' CSV HEADER

SELECT * FROM metric_summary
WHERE operation IN ('generation', 'insertion', 'pattern_line', 'pattern_two_lines', 'pattern_corners', 'pattern_full', 'pattern_custom', 'new_ball_61')
ORDER BY dataset_size, representation, operation;
