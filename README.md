# CleverVet Mobile Test3 deployment

Source of truth: [fork995/Test2, test3](https://github.com/fork995/Test2/tree/test3).

This repository owns only https://fork995.github.io/Test3/ . It never writes to Test2.
The workflow checks the public source branch every five minutes (GitHub schedules can be delayed), skips an already published SHA, and tests/builds before deploying its own Pages artifact. Failed builds leave the previously deployed site in place. `source-revision.txt` identifies the published source SHA. Manual `workflow_dispatch` provides immediate updates without waiting for the scheduler.

Pages source must be **GitHub Actions**. No cross-repository token, deploy key, or shared publication directory is used.
