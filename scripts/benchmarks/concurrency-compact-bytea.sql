SET search_path = bingo_card_bench, public;
SELECT count(*) FROM compact_card
WHERE compact_positions_complete(
  packed,
  ARRAY(SELECT generate_series(1,25)),
  B'111101111011110111101111011110111101111011110111101111011110111101111011110'::bit(75)
);
