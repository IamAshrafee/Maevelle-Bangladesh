# Phase 01-C evidence integrity

The affected file is phase01ar-evidence/performance.json. Its original SHA-256 is 4722e88f62ad39edd7e597501d170408ffc607e201e752b4b1a2cc15d730e0aa. The regenerated historical file hashes to a8445a040ec89a1ba06a3badce36bc8e713a0c4e02c51f24a402cd12b943f975 and retains its documented provenance and sample values.

Read-only inspection hashed 4,640 Git blobs between 2 KB and 500 KB, including unreachable objects. Blob e4c7fca58bca558ed57accbe4e035feb863510ca matches the original SHA-256 exactly. Extracted with git cat-file blob and independently hashed. Time Machine listed no local snapshots or machine backup directory. The [recovered original](phase01c-evidence/recovered-01ar-performance.json) and [search record](phase01c-evidence/recovery-search.txt) preserve the result. Historical reports and the regenerated file retain their original meaning.

| Lines | Statements | Original median ms | Original p95 ms |
| --- | ---: | ---: | ---: |
| 1 | 8 | 4.454958 | 4.843333 |
| 20 | 8 | 4.596708 | 5.188625 |
| 100 | 8 | 5.644667 | 6.847083 |

The benchmark requires CART_PERFORMANCE_OUTPUT and now creates the file exclusively. Existing paths yield EEXIST and preserve bytes. Builds write ignored Next artifacts. Tests use explicitly verified disposable databases and the browser harness writes to Phase 01-C scratch paths. Evidence recovery is PASS. See the [baseline](phase01c-evidence/baseline.json) and [preservation audit](phase01c-evidence/preservation.json).
