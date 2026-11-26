import { useEffect, useState } from 'react';
import { Button, Popover } from '../components/ui';

type Evidence = { name?: string; title?: string; href?: string };
type Stage = Evidence & { id: string; name: string; state: string; note: string };
type Progress = { revision: string; activeStage?: string; sourceNote?: string; stages: Stage[]; covers: Evidence[] };

const stateLabel: Record<string, string> = {
  ready: '已就绪', review: '待评审', waiting: '待核验', checking: '核验中', confirmed: '已确认', rework: '返工中',
};

function EvidenceLink({ href, children }: { href: string; children: string }) {
  return <a className="text-text-1 underline underline-offset-2 hover:text-accent" href={href}
    target="_blank" rel="noreferrer">{children}</a>;
}

export function ProductionProgress() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<Progress>();
  const [failed, setFailed] = useState(false);
  const enabled = /^\/studio\/full\/?$/.test(window.location.pathname);
  useEffect(() => {
    if (!enabled || !open) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const response = await fetch('/laohu-studio/status', { signal: controller.signal });
        if (!response.ok) throw new Error(`Progress data ${response.status}`);
        const next: Progress = await response.json();
        if (!controller.signal.aborted) {
          setProgress(previous => previous?.revision === next.revision && previous.sourceNote === next.sourceNote ? previous : next);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(read, 3000);
      }
    }
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled, open]);
  if (!enabled) return null;
  return <Popover open={open} onOpenChange={setOpen} align="start" aria-label="制作进度"
    className="w-[min(460px,calc(100vw-24px))] max-h-[75vh] overflow-y-auto"
    trigger={<Button size="sm" variant="ghost">制作进度</Button>}>
    {failed ? <p role="status">制作证据暂时无法读取</p> : !progress ? <p role="status">读取本片制作证据…</p> : <>
      {progress.sourceNote && <p className="pb-2 text-text-3" role="status">{progress.sourceNote}</p>}
      <ol className="divide-y divide-border-strong" aria-label="本片制作阶段">
        {progress.stages.map(stage => <li key={stage.id} className="py-2" aria-current={stage.id === progress.activeStage ? 'step' : undefined}>
          <div className="flex items-baseline justify-between gap-2">
            <strong>{stage.name}</strong>
            <span>{stage.id === progress.activeStage ? '当前 · ' : ''}{stateLabel[stage.state] ?? stage.state}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-text-3">
            <span>{stage.note}</span>
            {stage.href && <EvidenceLink href={stage.href}>证据</EvidenceLink>}
          </div>
        </li>)}
      </ol>
      {progress.covers.length > 0 && <div className="border-t border-border-strong pt-2">
        <strong>Cover 设计图</strong>
        <ul className="flex flex-wrap gap-2 pt-1">
          {progress.covers.map(cover => cover.href && <li key={cover.href}>
            <EvidenceLink href={cover.href}>{cover.name ?? cover.title ?? '方向图'}</EvidenceLink>
          </li>)}
        </ul>
      </div>}
    </>}
  </Popover>;
}
