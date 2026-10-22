/**
 * The session-scoped `dsh-resource://file/...` address grammar shared by the
 * tab title and the notebook body.
 * @module dsh-jupyter/client/address
 */
/** Split a `dsh-resource://file/session/<id>/<path>` address. */
export declare function fileOf(address: string): {
    sessionId: string;
    path: string;
} | null;
/** The chip text: the notebook's file name. */
export declare function titleOf(address: string): string;
