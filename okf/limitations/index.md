# Limitation

* [Checkout must be the base branch](checkout-must-be-the-base-branch.md) - base-branch pointed at a ref other than the checked-out one produces a tree derived from the wrong ref.
* [No sticky PR comment in pr mode](no-sticky-pr-comment.md) - pr mode writes only the job summary; a sticky, updatable PR comment was anticipated but is not implemented.
* [The pr-mode head branch is action-owned](pr-head-branch-is-action-owned.md) - A commit pushed onto the fixed pr-mode head branch is discarded on the next run, by design.
