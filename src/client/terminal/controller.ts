/**
 * Terminal panel controller: the single owner of the panel's open/closed
 * state. Framework-free (structural runtime faces, dsh-ssh controller style)
 * so the DOM mounts and the React panel share one tiny subscription surface.
 * The state lives only for the browser session (no persistence).
 * @module dsh-jupyter/client/terminal/controller
 */

/** Immutable controller snapshot for UI subscriptions. */
export interface TerminalControllerSnapshot {
  panelOpen: boolean
}

/** The panel state owner the sidebar entry toggles and the view renders from. */
export class TerminalController {
  private panelOpen = false
  private listeners = new Set<() => void>()

  getSnapshot(): TerminalControllerSnapshot {
    return { panelOpen: this.panelOpen }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  open(): void {
    if (this.panelOpen) return
    this.panelOpen = true
    this.notify()
  }

  close(): void {
    if (!this.panelOpen) return
    this.panelOpen = false
    this.notify()
  }

  toggle(): void {
    if (this.panelOpen) this.close()
    else this.open()
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn()
  }
}
