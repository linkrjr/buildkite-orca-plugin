// Does a block step have input fields (AC22)? Buildkite's REST job JSON has no `fields`, and its
// GraphQL schema doesn't expose them either: JobTypeBlock.step is a StepInput that only has
// conditional, dependencies, key and uuid (https://buildkite.com/docs/apis/graphql/schemas/object/jobtypeblock).
// So nothing can confirm a step has no fields, and the answer is always `true` (the panel then shows
// "Unblock in Buildkite"). If Buildkite ever exposes them, change only this function: callers
// (jobs.unblock, and T3's Job.hasFields) treat `false` as "confirmed no fields" and anything else as "has fields".

/** The REST job fields a lookup could use: `id` and `graphql_id` of the manual job. */
export type BlockJobRef = { id: string; graphql_id?: string }

/** `true` unless it can be confirmed that the block step has no input fields. */
export async function blockStepHasFields(_job: BlockJobRef): Promise<boolean> {
  return true
}
