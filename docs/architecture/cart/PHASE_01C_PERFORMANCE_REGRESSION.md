# Phase 01-C performance regression

| Synthetic lines | Domain statements | Median ms | Sample p95 ms |
| --- | ---: | ---: | ---: |
| 1 | 8 | 4.76 | 6.34 |
| 20 | 8 | 6.05 | 10.59 |
| 100 | 8 | 7.16 | 14.63 |

The table uses the isolated acceptance benchmark and ten sequential observations per size. The sample p95 is the largest of ten observations. The domain statement count excludes API owner resolution, protection and routing. Price and owner EXPLAIN ANALYZE/BUFFERS are stored with the [benchmark output](phase01c-evidence/backend-performance.json). Synthetic stock is absent on benchmark-only variants and fixture catalog cardinality is small. Recovered original timings are preserved separately.

The compiled PDP loaded one ordinary Cart GET. Its first Add used two GETs, one initialization POST and one line POST. The sampled route decoded 767,854 JavaScript bytes and estimated 212,835 gzip bytes. The comparable Phase 01B-R sample recorded 767,791 and 212,807. These route observations include shared chunks and reflect this synthetic profile. Touch-emulated Add reached the confirmed header in 140.93 ms, including the 80 ms polling granularity. See [request and resource data](phase01c-evidence/performance.json).

A selectable-product run measured Add confirmation, Cart navigation to visible line, 12 reads in three batches of four, and four serial revision-checked mutations. The probe records same-origin response-header times and validates projected variant, price and mutation quantity. Separate database races verify the effect of concurrent writers, including 12 duplicate Clear submissions and coupon/Clear. See [bounded probes](phase01c-evidence/variant.json).

The runtime retains one controller and reference-counted listener/channel/poll cleanup, minimum hint payload, read dedupe and cooldown. Cross-tab Clear measured bounded follow-up reads. Lifecycle checks exercise focus/visibility/reload. The browser C01 test showed zero new writes during recovery preflight backoff and replayed the exact key afterward. No heap growth, CWV, production tail-latency or high-cardinality capacity claim follows from these measurements.
