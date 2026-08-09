SET search_path = bingo_card_bench, public;
SELECT count(*) FROM bitset_card
WHERE mask_complete(
  full_mask,
  B'111101111011110111101111011110111101111011110111101111011110111101111011110'::bit(75)
);
