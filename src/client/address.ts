/**
 * The session-scoped `dsh-resource://file/...` address grammar shared by the
 * tab title and the notebook body.
 * @module dsh-jupyter/client/address
 */

/** Prefix of the session-scoped file address a tab receives as `contentId`. */
const FILE_PREFIX = 'dsh-resource://file/session/'

/** Split a `dsh-resource://file/session/<id>/<path>` address. */
export function fileOf(address: string): { sessionId: string; path: string } | null {
  if (!address.startsWith(FILE_PREFIX)) return null
  const rest = address.slice(FILE_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null
  try {
    return {
      sessionId: decodeURIComponent(rest.slice(0, slash)),
      // Decode one segment at a time: a literal %2F in a name must stay a
      // name, not become a separator.
      path: rest.slice(slash + 1).split('/').map((segment) => decodeURIComponent(segment)).join('/'),
    }
  } catch {
    return null
  }
}

/** The chip text: the notebook's file name. */
export function titleOf(address: string): string {
  const file = fileOf(address)
  if (file === null) return 'Notebook'
  const name = file.path.slice(file.path.lastIndexOf('/') + 1)
  return name === '' ? 'Notebook' : name
}
