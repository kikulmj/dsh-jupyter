/**
 * Terminal panel controller: the single owner of the panel's open/closed
 * state. Framework-free (structural runtime faces, dsh-ssh controller style)
 * so the DOM mounts and the React panel share one tiny subscription surface.
 * The state lives only for the browser session (no persistence).
 * @module dsh-jupyter/client/terminal/controller
 */
/** Immutable controller snapshot for UI subscriptions. */
export interface TerminalControllerSnapshot {
    panelOpen: boolean;
}
/** The panel state owner the sidebar entry toggles and the view renders from. */
export declare class TerminalController {
    private panelOpen;
    private listeners;
    getSnapshot(): TerminalControllerSnapshot;
    subscribe(fn: () => void): () => void;
    open(): void;
    close(): void;
    toggle(): void;
    private notify;
}
