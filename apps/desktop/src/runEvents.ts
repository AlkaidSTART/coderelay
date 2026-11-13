export class RunEvents {
  private activeRunId: string | null = null;
  private earlyEvents: { runId: string; apply: () => void }[] | null = null;

  begin(): boolean {
    if (this.earlyEvents || this.activeRunId !== null) {
      return false;
    }
    this.earlyEvents = [];
    return true;
  }

  dispatch(runId: string, apply: () => void): void {
    if (this.earlyEvents) {
      this.earlyEvents.push({ runId, apply });
    } else if (runId === this.activeRunId) {
      apply();
    }
  }

  activate(runId: string): void {
    const events = this.earlyEvents ?? [];
    this.earlyEvents = null;
    this.activeRunId = runId;
    for (const event of events) {
      this.dispatch(event.runId, event.apply);
    }
  }

  reset(): void {
    this.activeRunId = null;
    this.earlyEvents = null;
  }
}
