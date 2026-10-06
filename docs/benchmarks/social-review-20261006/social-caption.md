MIMORI — local security benchmark, 6 October 2026.

On a frozen 103-case detector regression (62 public InjecAgent base attacks, 8 authored attacks and 33 benign inputs), Llama 3.1 semantic review caught 60/70 attacks: 85.7% recall, with 1/33 benign false positives and zero review errors. Public-only recall: 52/62, or 83.9%.

We also actually trained Laya: 4 epochs, 192 optimizer steps, 26.2M trainable head parameters. On a separate synthetic held-out set, calibrated detection improved from 8/40 to 13/40, with 0/48 benign false positives for both profiles. It added no catches on the public/development regression and increased false positives when combined with Llama, so the candidate was not promoted for blocking.

Regex caught direct override signatures well but missed most keyword-free base attacks. The full static evaluation and all detector ablations are on the board.

These are local detector results, not official InjecAgent ASR, a leaderboard rank, or a production guarantee. Combined rows are offline OR replays. Publishing the misses and false positives is part of the result.

Dataset: https://github.com/uiuc-kang-lab/InjecAgent
