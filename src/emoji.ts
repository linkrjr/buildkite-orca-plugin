// Turns the `:shortcode:` markers in a Buildkite job name into icons and Unicode emoji.
import { BUILDKITE_EMOJI, UNICODE_EMOJI } from './emoji-data'

export type JobIcon = { name: string; src: string }

// A shortcode must not touch a letter or digit, so `yarn test:unit:ci` and `12:30:45` stay as written.
const SHORTCODE = /(?<![a-z0-9]):([a-z0-9_+.-]+):(?![a-z0-9])/gi

/**
 * Buildkite emoji become icons (Orca's `Image` can't sit inside `Text`), standard emoji become
 * Unicode in the text, and unknown shortcodes are dropped.
 */
export function jobLabel(name: string): { icons: JobIcon[]; text: string } {
  const icons: JobIcon[] = []
  const text = name
    .replace(SHORTCODE, (_whole, code: string) => {
      const key = code.toLowerCase()
      if (Object.hasOwn(BUILDKITE_EMOJI, key)) {
        icons.push({ name: key, src: `assets/emoji/${BUILDKITE_EMOJI[key]}` })
        return ''
      }
      if (Object.hasOwn(UNICODE_EMOJI, key)) return UNICODE_EMOJI[key]
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { icons, text }
}
