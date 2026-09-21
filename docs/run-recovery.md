# Recovering a hosted run

A stopped run exposes **Resume remaining tests** when it has undispatched requests and no unresolved in-flight batch. Review the original frozen request plan and the additional reservation, then explicitly authorize continuation. It uses the same run and advances from the saved cursor. Recorded failures, successes and uncertain recorded responses are never resent. The report still includes those failures.

Unknown charges stay reserved across resumes, stops and later batches. Both the original run budget and account allowance are checked. A concurrent authorization cannot reopen the run twice. If a dispatch has not settled, use **Check saved responses** first; incomplete evidence prevents resumption of that batch.

Signed stopped snapshots are retained. Subsequent completion snapshots use a monotonically numbered resume key; previous signatures and observations remain unchanged.

**Clear from workspace** removes the selected panel/results, not the saved run or ledger. Changing the application, policy or test settings deselects old results. Editing the draft during execution stops further batches; already sent requests may finish. Saved runs can be selected deliberately later and keep their original policy. Finishing an outdated request cannot automatically switch the workspace back to its results.

Validation uses isolated mock provider responses only; no paid requests are required.
