/** Invalidates delayed UI work when its owning page or dialog is replaced. */
export class WorkflowSession {
  private revision = 0;
  invalidate(): void { this.revision++; }
  capture(): () => boolean {
    const revision = this.revision;
    return () => this.revision === revision;
  }
  begin(): () => boolean { this.invalidate(); return this.capture(); }
}
