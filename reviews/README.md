# reviews/

Memory for the `capability-critic` loop. One file per capability, named for the capability id.

Without these files the loop has no memory: every review starts from zero, and a
capability's `status` is whatever the last person typed. With them, promotion is
evidence-backed — the validator refuses `reviewed` or `ratified` unless the record
supports it.

- `open_fails: 0` — mechanical FAILs are closed. The entry is *critic-passed*.
- `flags` — judgment calls. Only the capability owner may close one, and closing
  requires `closed_by` and `closed_on`.
- `ratified_by` / `ratified_on` — required for `status: ratified`, and only valid
  once every FLAG is closed.

Any edit to a ratified capability should re-run the critic and reopen this record.
