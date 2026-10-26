# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- Implementation tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`, with one file per ticket.
- Record triage state in a `Status:` line near the top of each ticket.
  Use the role strings in `triage-labels.md`.
- Append conversation history under `## Comments`.

## Skill operations

- Publish a spec: create the feature's `spec.md`.
- Publish implementation tickets: create individual files in `issues/`.
- Fetch a ticket: read the referenced file; resolve ticket numbers within
  the relevant feature directory.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, containing Notes, Decisions-so-far,
  and Fog sections.
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`.
  Record `Type: research`, `prototype`, `grilling`, or `task`.
- Wayfinding tickets use `Status: open`, `claimed`, or `resolved`.
- Dependencies: record `Blocked by: NN, NN` near the top.
  A ticket is unblocked when all listed tickets are resolved.
- Frontier: select the first ticket by number that is open and unblocked.
- Claim: save `Status: claimed` before starting work.
- Resolve: append the result under `## Answer`, set `Status: resolved`,
  and add a summary and link to the map's Decisions-so-far.
